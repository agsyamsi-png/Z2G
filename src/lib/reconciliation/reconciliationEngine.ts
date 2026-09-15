import crypto from "crypto";
import { getDatabase, ReconciliationReportRow, SignOffRow, MappingRow, MessageLedgerRow } from "../db";

export interface MailboxReconciliationResult {
  mappingId: string;
  sourceEmail: string;
  targetEmail: string;
  sourceCountS: number;
  migratedCount: number;
  unresolvedCountU: number;
  discrepancyPercent: number;
  duplicatesCount: number;
  corruptedCount: number;
  status: "PASSED" | "EXCEPTION_REQUIRED" | "FAILED" | "EMPTY_SCOPE";
}

export interface ProjectReconciliationSummary {
  reportRevision: number;
  totalSourceCountS: number;
  totalUnresolvedCountU: number;
  projectDiscrepancyPercent: number;
  totalDuplicates: number;
  totalCorrupted: number;
  isEligibleForSignOff: boolean;
  requiresException: boolean;
  mailboxes: MailboxReconciliationResult[];
}

/**
 * Runs reconciliation calculation for a project using the formula:
 * S = unique in-scope source messages
 * U = unverified / missing messages
 * discrepancy_percent = 100 * U / S (computed from summed U and S across the project)
 */
export function generateReconciliationReport(projectId: string): ProjectReconciliationSummary {
  const db = getDatabase();

  const mappings = db
    .prepare("SELECT * FROM mappings WHERE project_id = ?")
    .all(projectId) as MappingRow[];

  let totalS = 0;
  let totalU = 0;
  let totalDuplicates = 0;
  let totalCorrupted = 0;

  const mailboxes: MailboxReconciliationResult[] = [];

  for (const mapping of mappings) {
    // Retrieve baseline message count (S)
    const baseline = db
      .prepare(
        "SELECT total_messages FROM discovery_baselines WHERE mapping_id = ? AND status = 'REVIEWED' ORDER BY revision DESC LIMIT 1"
      )
      .get(mapping.id) as { total_messages: number } | undefined;

    const sourceS = baseline?.total_messages || 0;

    // Retrieve ledger counts for this mapping
    const ledgerEntries = db
      .prepare("SELECT * FROM message_ledger WHERE mapping_id = ?")
      .all(mapping.id) as MessageLedgerRow[];

    const verifiedCount = ledgerEntries.filter((e) => e.transfer_status === "VERIFIED").length;
    const corruptedCount = ledgerEntries.filter((e) => e.transfer_status === "CORRUPTED").length;
    const failedCount = ledgerEntries.filter((e) => e.transfer_status === "FAILED").length;

    // Check for target duplicates
    const targetMsgIds = ledgerEntries.map((e) => e.target_message_id).filter(Boolean);
    const uniqueTargetMsgIds = new Set(targetMsgIds);
    const duplicatesCount = targetMsgIds.length - uniqueTargetMsgIds.size;

    const unresolvedU = Math.max(0, sourceS - verifiedCount) + corruptedCount + failedCount;

    let discrepancyPercent = 0.0;
    let mailboxStatus: "PASSED" | "EXCEPTION_REQUIRED" | "FAILED" | "EMPTY_SCOPE" = "PASSED";

    if (sourceS === 0) {
      discrepancyPercent = 0.0;
      mailboxStatus = "EMPTY_SCOPE";
    } else {
      discrepancyPercent = Number(((unresolvedU / sourceS) * 100).toFixed(2));
      if (discrepancyPercent <= 1.0) {
        mailboxStatus = "PASSED";
      } else if (discrepancyPercent <= 2.0) {
        mailboxStatus = "EXCEPTION_REQUIRED";
      } else {
        mailboxStatus = "FAILED";
      }
    }

    totalS += sourceS;
    totalU += unresolvedU;
    totalDuplicates += duplicatesCount;
    totalCorrupted += corruptedCount;

    mailboxes.push({
      mappingId: mapping.id,
      sourceEmail: mapping.source_email,
      targetEmail: mapping.target_email,
      sourceCountS: sourceS,
      migratedCount: verifiedCount,
      unresolvedCountU: unresolvedU,
      discrepancyPercent,
      duplicatesCount,
      corruptedCount,
      status: mailboxStatus,
    });
  }

  const projectDiscrepancyPercent =
    totalS === 0 ? 0.0 : Number(((totalU / totalS) * 100).toFixed(2));

  const isEligibleForSignOff = projectDiscrepancyPercent <= 2.0;
  const requiresException = projectDiscrepancyPercent > 1.0 && projectDiscrepancyPercent <= 2.0;

  // Persist report in database
  const latestReport = db
    .prepare(
      "SELECT report_revision FROM reconciliation_reports WHERE project_id = ? ORDER BY report_revision DESC LIMIT 1"
    )
    .get(projectId) as { report_revision: number } | undefined;

  const nextRevision = (latestReport?.report_revision || 0) + 1;
  const reportId = `rep-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO reconciliation_reports (
      id, project_id, report_revision, source_count_s, unresolved_count_u, 
      discrepancy_percent, duplicates_count, corrupted_count, details_json, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    reportId,
    projectId,
    nextRevision,
    totalS,
    totalU,
    projectDiscrepancyPercent,
    totalDuplicates,
    totalCorrupted,
    JSON.stringify(mailboxes),
    now
  );

  return {
    reportRevision: nextRevision,
    totalSourceCountS: totalS,
    totalUnresolvedCountU: totalU,
    projectDiscrepancyPercent,
    totalDuplicates,
    totalCorrupted,
    isEligibleForSignOff,
    requiresException,
    mailboxes,
  };
}

/**
 * Executes operator sign-off with discrepancy gates and exception handling.
 */
export function executeProjectSignOff(
  projectId: string,
  operatorName: string,
  options: {
    reportRevision?: number;
    acceptedExceptions?: string[];
    isSubset?: boolean;
    includedMappingIds?: string[];
  } = {}
): SignOffRow {
  const db = getDatabase();

  const report = db
    .prepare(
      "SELECT * FROM reconciliation_reports WHERE project_id = ? ORDER BY report_revision DESC LIMIT 1"
    )
    .get(projectId) as ReconciliationReportRow | undefined;

  if (!report) {
    throw new Error("Cannot sign off: no reconciliation report has been generated");
  }

  if (report.discrepancy_percent > 2.0) {
    throw new Error(
      `Cannot sign off: project discrepancy (${report.discrepancy_percent}%) exceeds maximum allowable threshold of 2.0%`
    );
  }

  if (report.discrepancy_percent > 1.0 && (!options.acceptedExceptions || options.acceptedExceptions.length === 0)) {
    throw new Error(
      `Sign-off with discrepancy between 1.0% and 2.0% (${report.discrepancy_percent}%) requires explicit documented exceptions`
    );
  }

  const signOffId = `sign-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const status = options.isSubset ? "SUBSET_SIGNED_OFF" : "SIGNED_OFF";

  const scopeSummary = {
    totalS: report.source_count_s,
    totalU: report.unresolved_count_u,
    discrepancyPercent: report.discrepancy_percent,
    isSubset: options.isSubset || false,
    includedMappingIds: options.includedMappingIds || "ALL",
  };

  db.prepare(
    `INSERT INTO sign_offs (
      id, project_id, report_revision, operator_name, accepted_exceptions_json, 
      scope_summary_json, status, signed_off_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    signOffId,
    projectId,
    report.report_revision,
    operatorName,
    options.acceptedExceptions ? JSON.stringify(options.acceptedExceptions) : null,
    JSON.stringify(scopeSummary),
    status,
    now
  );

  db.prepare(
    "UPDATE projects SET status = ?, updated_at = ? WHERE id = ?"
  ).run(status, now, projectId);

  // Audit log
  db.prepare(
    `INSERT INTO audit_logs (id, project_id, actor, action, metadata_json, created_at)
     VALUES (?, ?, ?, 'SIGN_OFF', ?, ?)`
  ).run(
    `audit-${crypto.randomUUID()}`,
    projectId,
    operatorName,
    JSON.stringify({ reportRevision: report.report_revision, status, scopeSummary }),
    now
  );

  return db.prepare("SELECT * FROM sign_offs WHERE id = ?").get(signOffId) as SignOffRow;
}
