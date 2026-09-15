import Papa from "papaparse";

export interface ColumnMapping {
  source_email_index: number;
  source_password_index: number;
  target_email_index: number;
}

export interface HeaderDetectionResult {
  headersDetected: boolean;
  autoMapping: ColumnMapping | null;
  columns: string[]; // safe column names
  ambiguous: boolean;
  unrecognizedColumns: number[];
  error?: string;
}

export interface ValidatedRow {
  rowNumber: number; // 1-indexed (data row)
  physicalLine: number;
  source_email: string;
  source_password: string; // kept in memory only for encryption
  target_email: string;
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface SafeRowPreview {
  rowNumber: number;
  source_email: string; // masked or safe
  target_email: string; // safe
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface CsvImportSummary {
  totalRecords: number;
  csvValidRecords: number;
  recordsRequiringAttention: number;
  duplicateMappingsCount: number;
  invalidEmailCount: number;
  missingCredentialCount: number;
  rows: ValidatedRow[];
  safePreviews: SafeRowPreview[];
}

const ALIASES = {
  source_email: [
    "source_email",
    "source",
    "zoho_email",
    "zoho_address",
    "imap_email",
    "source_imapuser",
    "source_imap_user",
    "source_user",
    "source_mailbox",
  ],
  source_password: [
    "source_password",
    "password",
    "zoho_password",
    "imap_password",
    "source_imap_password",
    "source_imappassword",
    "imap_pass",
  ],
  target_email: [
    "target_email",
    "target",
    "google_email",
    "google_workspace_email",
    "destination",
    "target_guser",
    "target_g_user",
    "target_user",
    "target_mailbox",
  ],
};

export function normalizeHeaderName(header: string): string {
  return header
    .replace(/^\uFEFF/, "") // strip UTF-8 BOM
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function detectHeaders(rawFirstLineOrRow: string[]): HeaderDetectionResult {
  const normalized = rawFirstLineOrRow.map(normalizeHeaderName);
  const columnCount = rawFirstLineOrRow.length;

  let sourceEmailIndex = -1;
  let sourcePasswordIndex = -1;
  let targetEmailIndex = -1;

  normalized.forEach((h, idx) => {
    if (ALIASES.source_email.includes(h)) {
      if (sourceEmailIndex === -1) sourceEmailIndex = idx;
      else sourceEmailIndex = -2; // Ambiguous
    }
    if (ALIASES.source_password.includes(h)) {
      if (sourcePasswordIndex === -1) sourcePasswordIndex = idx;
      else sourcePasswordIndex = -2; // Ambiguous
    }
    if (ALIASES.target_email.includes(h)) {
      if (targetEmailIndex === -1) targetEmailIndex = idx;
      else targetEmailIndex = -2; // Ambiguous
    }
  });

  const safeColumns: string[] = [];
  const unrecognized: number[] = [];

  for (let i = 0; i < columnCount; i++) {
    if (i === sourceEmailIndex) safeColumns.push("source_email");
    else if (i === sourcePasswordIndex) safeColumns.push("source_password");
    else if (i === targetEmailIndex) safeColumns.push("target_email");
    else {
      safeColumns.push(`Column ${i + 1}`);
      unrecognized.push(i);
    }
  }

  const isComplete =
    sourceEmailIndex >= 0 &&
    sourcePasswordIndex >= 0 &&
    targetEmailIndex >= 0 &&
    sourceEmailIndex !== sourcePasswordIndex &&
    sourceEmailIndex !== targetEmailIndex &&
    sourcePasswordIndex !== targetEmailIndex;

  const isAmbiguous =
    sourceEmailIndex === -2 || sourcePasswordIndex === -2 || targetEmailIndex === -2;

  return {
    headersDetected: isComplete && !isAmbiguous,
    autoMapping: isComplete
      ? {
          source_email_index: sourceEmailIndex,
          source_password_index: sourcePasswordIndex,
          target_email_index: targetEmailIndex,
        }
      : null,
    columns: safeColumns,
    ambiguous: isAmbiguous,
    unrecognizedColumns: unrecognized,
  };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailSyntax(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  return EMAIL_REGEX.test(trimmed);
}

/**
 * Parses and validates raw CSV content using specified or detected column mappings.
 * Enforces duplicate detection, credential leak suppression, syntax validation,
 * and preserves credential content without trimming whitespace from passwords.
 */
export function parseAndValidateCsv(
  csvContent: string,
  mapping: ColumnMapping,
  hasHeaderRow = true,
  existingProjectSourceEmails: Set<string> = new Set(),
  existingProjectTargetEmails: Set<string> = new Set()
): CsvImportSummary {
  // Strip BOM if present
  let cleanCsv = csvContent;
  if (cleanCsv.charCodeAt(0) === 0xfeff) {
    cleanCsv = cleanCsv.slice(1);
  }

  const parsed = Papa.parse<string[]>(cleanCsv, {
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  const rawRows = parsed.data;
  if (!rawRows || rawRows.length === 0) {
    return {
      totalRecords: 0,
      csvValidRecords: 0,
      recordsRequiringAttention: 0,
      duplicateMappingsCount: 0,
      invalidEmailCount: 0,
      missingCredentialCount: 0,
      rows: [],
      safePreviews: [],
    };
  }

  const dataRows = hasHeaderRow ? rawRows.slice(1) : rawRows;
  if (dataRows.length > 10000) {
    throw new Error(`CSV exceeds maximum limit of 10,000 rows (found ${dataRows.length})`);
  }

  const validatedRows: ValidatedRow[] = [];
  const safePreviews: SafeRowPreview[] = [];

  // Track occurrences within this upload for duplicate detection
  const sourceEmailCounts = new Map<string, number>();
  const targetEmailCounts = new Map<string, number>();

  // First pass: count email occurrences across upload (normalized lower-case for comparison)
  dataRows.forEach((row) => {
    const rawSource = (row[mapping.source_email_index] || "").trim().toLowerCase();
    const rawTarget = (row[mapping.target_email_index] || "").trim().toLowerCase();
    if (rawSource) {
      sourceEmailCounts.set(rawSource, (sourceEmailCounts.get(rawSource) || 0) + 1);
    }
    if (rawTarget) {
      targetEmailCounts.set(rawTarget, (targetEmailCounts.get(rawTarget) || 0) + 1);
    }
  });

  let duplicateCount = 0;
  let invalidEmailCount = 0;
  let missingCredCount = 0;

  dataRows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const physicalLine = hasHeaderRow ? idx + 2 : idx + 1;

    const rawSource = row[mapping.source_email_index] || "";
    const rawPassword = row[mapping.source_password_index] || "";
    const rawTarget = row[mapping.target_email_index] || "";

    const sourceEmail = rawSource.trim();
    // Passwords must preserve whitespace exactly!
    const sourcePassword = rawPassword;
    const targetEmail = rawTarget.trim();

    let isValid = true;
    let errorCode: string | undefined;
    let errorMessage: string | undefined;

    // 1. Missing required fields check
    if (!sourceEmail || !targetEmail || !sourcePassword) {
      isValid = false;
      errorCode = "MISSING_REQUIRED_FIELD";
      errorMessage = "Missing required email or credential field";
      if (!sourcePassword) missingCredCount++;
    }

    // 2. Credential Leak Suppression:
    // If an email value equals the password or contains known password pattern, suppress and invalidate
    if (
      isValid &&
      (sourceEmail === sourcePassword ||
        targetEmail === sourcePassword ||
        (sourcePassword.length > 3 && sourceEmail.includes(sourcePassword)))
    ) {
      isValid = false;
      errorCode = "CREDENTIAL_LEAK_PREVENTED";
      errorMessage = "Email field matched credential value and was suppressed";
    }

    // 3. Email syntax validation
    if (isValid) {
      if (!isValidEmailSyntax(sourceEmail)) {
        isValid = false;
        errorCode = "INVALID_EMAIL";
        errorMessage = "Invalid source email address syntax";
        invalidEmailCount++;
      } else if (!isValidEmailSyntax(targetEmail)) {
        isValid = false;
        errorCode = "INVALID_EMAIL";
        errorMessage = "Invalid target email address syntax";
        invalidEmailCount++;
      }
    }

    // 4. Duplicate checks (internal to upload)
    if (isValid) {
      const lowerSource = sourceEmail.toLowerCase();
      const lowerTarget = targetEmail.toLowerCase();

      const sourceOccurrences = sourceEmailCounts.get(lowerSource) || 0;
      const targetOccurrences = targetEmailCounts.get(lowerTarget) || 0;

      if (sourceOccurrences > 1) {
        isValid = false;
        errorCode = "DUPLICATE_MAPPING";
        errorMessage = `Duplicate source mailbox mapping in upload (${sourceEmail})`;
        duplicateCount++;
      } else if (targetOccurrences > 1) {
        isValid = false;
        errorCode = "DUPLICATE_MAPPING";
        errorMessage = `Duplicate target mailbox mapping in upload (${targetEmail})`;
        duplicateCount++;
      }
    }

    const validatedRow: ValidatedRow = {
      rowNumber,
      physicalLine,
      source_email: sourceEmail,
      source_password: sourcePassword,
      target_email: targetEmail,
      isValid,
      errorCode,
      errorMessage,
    };

    // Build safe preview without leaking passwords
    // If invalid email or credential leak, never echo raw rejected input
    let safeSourcePreview = sourceEmail;
    let safeTargetPreview = targetEmail;

    if (errorCode === "CREDENTIAL_LEAK_PREVENTED") {
      safeSourcePreview = "[SUPPRESSED_CREDENTIAL]";
      safeTargetPreview = "[SUPPRESSED_CREDENTIAL]";
    } else if (errorCode === "INVALID_EMAIL") {
      safeSourcePreview = isValidEmailSyntax(sourceEmail) ? sourceEmail : "[INVALID_SYNTAX]";
      safeTargetPreview = isValidEmailSyntax(targetEmail) ? targetEmail : "[INVALID_SYNTAX]";
    }

    const safePreview: SafeRowPreview = {
      rowNumber,
      source_email: safeSourcePreview,
      target_email: safeTargetPreview,
      isValid,
      errorCode,
      errorMessage,
    };

    validatedRows.push(validatedRow);
    safePreviews.push(safePreview);
  });

  const totalRecords = validatedRows.length;
  const csvValidRecords = validatedRows.filter((r) => r.isValid).length;
  const recordsRequiringAttention = totalRecords - csvValidRecords;

  return {
    totalRecords,
    csvValidRecords,
    recordsRequiringAttention,
    duplicateMappingsCount: duplicateCount,
    invalidEmailCount,
    missingCredentialCount: missingCredCount,
    rows: validatedRows,
    safePreviews,
  };
}
