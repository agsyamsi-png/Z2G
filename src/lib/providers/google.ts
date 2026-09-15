import crypto from "crypto";
import { JWT } from "google-auth-library";
import { GoogleValidationResult } from "./types";
import { secureLogger } from "../security/logger";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_MIGRATION_SCOPE = "https://www.googleapis.com/auth/gmail.insert";

export const DEFAULT_GOOGLE_SERVICE_ACCOUNT_JSON =
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";

export function resolveServiceAccountJson(serviceAccountJson?: string | null): string {
  if (serviceAccountJson && serviceAccountJson.trim().length > 0) {
    return serviceAccountJson.trim();
  }
  return DEFAULT_GOOGLE_SERVICE_ACCOUNT_JSON;
}

export type GoogleMockHandler = (
  targetEmail: string,
  serviceAccountJson?: string | null
) => Promise<GoogleValidationResult> | GoogleValidationResult;

let customGoogleMockHandler: GoogleMockHandler | null = null;

export function setGoogleMockHandler(handler: GoogleMockHandler | null) {
  customGoogleMockHandler = handler;
}

/**
 * Validates Google Workspace destination mailbox access via Service Account Domain-Wide Delegation.
 * Calls Gmail API users.getProfile strictly without modifying mail or sending test messages.
 */
export async function validateGoogleMailbox(
  targetEmail: string,
  serviceAccountJson?: string | null
): Promise<GoogleValidationResult> {
  const activeServiceAccountJson = resolveServiceAccountJson(serviceAccountJson);

  if (customGoogleMockHandler) {
    return customGoogleMockHandler(targetEmail, activeServiceAccountJson);
  }

  // Handle mock domain / test mode
  if (
    targetEmail.endsWith("@test-google.local") ||
    targetEmail.endsWith("@example.com") ||
    process.env.MOCK_PROVIDERS === "true"
  ) {
    return mockGoogleValidation(targetEmail, activeServiceAccountJson);
  }

  try {
    let credentials: { client_email?: string; private_key?: string };
    try {
      credentials = JSON.parse(activeServiceAccountJson);
    } catch {
      return {
        success: false,
        errorType: "GOOGLE_API_ACCESS_FAILED",
        reason: "Invalid Service Account JSON configuration",
      };
    }

    if (!credentials.client_email || !credentials.private_key) {
      return {
        success: false,
        errorType: "GOOGLE_API_ACCESS_FAILED",
        reason: "Service Account JSON missing client_email or private_key",
      };
    }

    const authClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [GMAIL_READONLY_SCOPE, GMAIL_MIGRATION_SCOPE],
      subject: targetEmail, // Impersonation
    });

    const url = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
      targetEmail
    )}/profile`;

    const res = await authClient.request<{ emailAddress: string; messagesTotal?: number }>({
      url,
      method: "GET",
    });

    if (res.status === 200 && res.data) {
      return {
        success: true,
        profileEmail: res.data.emailAddress || targetEmail,
        messagesTotal: res.data.messagesTotal || 0,
      };
    }

    return {
      success: false,
      errorType: "GOOGLE_API_ACCESS_FAILED",
      reason: `Unexpected Google API status: ${res.status}`,
    };
  } catch (err: unknown) {
    const error = err as {
      response?: { status?: number; data?: { error?: { message?: string; status?: string } } };
      message?: string;
      code?: string | number;
    };

    const status = error.response?.status || error.code;
    const errorMsg = error.response?.data?.error?.message || error.message || "";
    const lowerMsg = errorMsg.toLowerCase();

    secureLogger.warn(`Google mailbox validation failed for ${targetEmail}: status ${status}`);

    // Authoritative user not found (HTTP 404 with userNotFound/notFound message)
    if (
      status === 404 ||
      lowerMsg.includes("user does not exist") ||
      lowerMsg.includes("account not found") ||
      lowerMsg.includes("user not found")
    ) {
      return {
        success: false,
        errorType: "GOOGLE_USER_NOT_FOUND",
        reason: "Google Workspace user account does not exist in target domain",
      };
    }

    // Network / DNS / Sandbox connectivity check
    if (
      lowerMsg.includes("enotfound") ||
      lowerMsg.includes("eai_again") ||
      lowerMsg.includes("fetch failed") ||
      lowerMsg.includes("network") ||
      lowerMsg.includes("etimedout") ||
      lowerMsg.includes("econnrefused")
    ) {
      return {
        success: false,
        errorType: "GOOGLE_API_ACCESS_FAILED",
        reason: "Network unreachable or DNS lookup failed when connecting to Google APIs",
      };
    }

    // Domain-wide delegation, permission, or scope errors
    if (
      status === 401 ||
      status === 403 ||
      lowerMsg.includes("delegation") ||
      lowerMsg.includes("unauthorized_client") ||
      lowerMsg.includes("access_denied") ||
      lowerMsg.includes("insufficient authentication scopes")
    ) {
      return {
        success: false,
        errorType: "GOOGLE_API_ACCESS_FAILED",
        reason: "Google domain-wide delegation access failed. Verify Admin Console OAuth scopes.",
      };
    }

    return {
      success: false,
      errorType: "GOOGLE_API_ACCESS_FAILED",
      reason: `Google API access error: ${errorMsg || "Unable to retrieve user profile"}`,
    };
  }
}

function mockGoogleValidation(
  targetEmail: string,
  serviceAccountJson?: string | null
): GoogleValidationResult {
  if (targetEmail.includes("notfound") || targetEmail.startsWith("absent@")) {
    return {
      success: false,
      errorType: "GOOGLE_USER_NOT_FOUND",
      reason: "Google Workspace user account does not exist in target domain",
    };
  }

  if (targetEmail.includes("delegationerror") || serviceAccountJson === "invalid-sa") {
    return {
      success: false,
      errorType: "GOOGLE_API_ACCESS_FAILED",
      reason: "Google domain-wide delegation access failed. Verify Admin Console OAuth scopes.",
    };
  }

  return {
    success: true,
    profileEmail: targetEmail,
    messagesTotal: 10,
  };
}

export interface GoogleMessageCheckResult {
  exists: boolean;
  messageId?: string;
  threadId?: string;
}

export interface GoogleImportResult {
  success: boolean;
  skipped: boolean;
  targetMessageId?: string;
  targetThreadId?: string;
  reason?: string;
}

/**
 * Checks if a message with the given RFC822 Message-ID already exists in the target Google Workspace mailbox.
 * Uses Gmail API users.messages.list with query 'rfc822msgid:<Message-ID>'.
 */
export async function checkTargetMessageExistsInGoogle(
  targetEmail: string,
  serviceAccountJson: string | null | undefined,
  rfc822MessageId: string
): Promise<GoogleMessageCheckResult> {
  const activeServiceAccountJson = resolveServiceAccountJson(serviceAccountJson);

  if (
    targetEmail.endsWith("@test-google.local") ||
    targetEmail.endsWith("@example.com") ||
    process.env.MOCK_PROVIDERS === "true"
  ) {
    // Mock simulation
    if (rfc822MessageId.includes("pre-existing-gws")) {
      return {
        exists: true,
        messageId: `gws-existing-${crypto.randomUUID().slice(0, 8)}`,
        threadId: `gws-thread-${crypto.randomUUID().slice(0, 8)}`,
      };
    }
    return { exists: false };
  }

  try {
    const credentials = JSON.parse(activeServiceAccountJson);
    const authClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [GMAIL_READONLY_SCOPE, GMAIL_MIGRATION_SCOPE],
      subject: targetEmail,
    });

    // Clean Message-ID for query (strip brackets if present)
    const cleanId = rfc822MessageId.replace(/^<|>$/g, "").trim();
    const query = encodeURIComponent(`rfc822msgid:${cleanId}`);
    const url = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
      targetEmail
    )}/messages?q=${query}&maxResults=1`;

    const res = await authClient.request<{
      messages?: Array<{ id: string; threadId: string }>;
      resultSizeEstimate?: number;
    }>({
      url,
      method: "GET",
    });

    if (res.status === 200 && res.data?.messages && res.data.messages.length > 0) {
      const match = res.data.messages[0];
      return {
        exists: true,
        messageId: match.id,
        threadId: match.threadId,
      };
    }

    return { exists: false };
  } catch (err) {
    secureLogger.warn(
      `Failed to query Google Workspace for existing message ${rfc822MessageId}: ${(err as Error).message}`
    );
    return { exists: false };
  }
}

/**
 * Imports raw RFC822 MIME message to Google Workspace mailbox with automated deduplication check.
 * If message exists in GWS, it skips insertion and returns existing target ID.
 */
export async function importMessageToGoogle(
  targetEmail: string,
  serviceAccountJson: string | null | undefined,
  rfc822Content: string | Buffer,
  rfc822MessageId?: string | null,
  labels: string[] = ["INBOX"]
): Promise<GoogleImportResult> {
  const activeServiceAccountJson = resolveServiceAccountJson(serviceAccountJson);

  // 1. Google Workspace pre-write deduplication check
  if (rfc822MessageId) {
    const existing = await checkTargetMessageExistsInGoogle(
      targetEmail,
      activeServiceAccountJson,
      rfc822MessageId
    );
    if (existing.exists && existing.messageId) {
      secureLogger.info(
        `Deduplication: Message ${rfc822MessageId} already exists in target GWS mailbox ${targetEmail} (ID: ${existing.messageId}). Skipping duplicate write.`
      );
      return {
        success: true,
        skipped: true,
        targetMessageId: existing.messageId,
        targetThreadId: existing.threadId,
        reason: "ALREADY_EXISTS_IN_GWS",
      };
    }
  }

  // 2. Mock Mode Insertion
  if (
    targetEmail.endsWith("@test-google.local") ||
    targetEmail.endsWith("@example.com") ||
    process.env.MOCK_PROVIDERS === "true"
  ) {
    const fakeId = `gmsg-${crypto.randomUUID()}`;
    const fakeThread = `gthread-${crypto.randomUUID()}`;
    return {
      success: true,
      skipped: false,
      targetMessageId: fakeId,
      targetThreadId: fakeThread,
    };
  }

  // 3. Live Google Workspace Gmail API users.messages.import
  try {
    const credentials = JSON.parse(activeServiceAccountJson);
    const authClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [GMAIL_MIGRATION_SCOPE],
      subject: targetEmail,
    });

    const rawBase64Url = Buffer.from(rfc822Content)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const url = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
      targetEmail
    )}/messages/import?neverMarkSpam=true&processForCalendar=true`;

    const res = await authClient.request<{ id: string; threadId: string }>({
      url,
      method: "POST",
      data: {
        raw: rawBase64Url,
        labelIds: labels,
      },
    });

    if (res.status === 200 && res.data?.id) {
      return {
        success: true,
        skipped: false,
        targetMessageId: res.data.id,
        targetThreadId: res.data.threadId,
      };
    }

    return {
      success: false,
      skipped: false,
      reason: `Gmail API returned status ${res.status}`,
    };
  } catch (err) {
    return {
      success: false,
      skipped: false,
      reason: (err as Error).message || "Gmail import failed",
    };
  }
}
