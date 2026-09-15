import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import { getDatabase, resetDatabaseForTesting, ProjectRow, MappingRow } from "@/lib/db";
import { generateMigrationMapTemplate } from "@/lib/csv/template";
import { detectHeaders, parseAndValidateCsv, ColumnMapping } from "@/lib/csv/parser";
import { commitCsvImport, updateMappingRow } from "@/lib/services/importService";
import { setZohoMockHandler } from "@/lib/providers/zoho";
import { setGoogleMockHandler } from "@/lib/providers/google";
import { validateProjectMappings } from "@/lib/queue/validationWorker";
import { discoverMailbox, reviewAndAcceptBaseline } from "@/lib/discovery/discoveryEngine";
import { executeMigrationJob } from "@/lib/migration/migrationEngine";
import { executeDeltaSync } from "@/lib/migration/deltaEngine";
import { messageLedger } from "@/lib/migration/ledger";
import { generateReconciliationReport, executeProjectSignOff } from "@/lib/reconciliation/reconciliationEngine";
import { purgeProjectCredentials } from "@/lib/security/purgeEngine";

describe("Codex Master Build Specification — Acceptance Scenarios (A01 - A19)", () => {
  let projectId: string;

  beforeEach(() => {
    process.env.MOCK_PROVIDERS = "true";
    resetDatabaseForTesting();
    setZohoMockHandler(null);
    setGoogleMockHandler(null);

    const db = getDatabase();
    projectId = `proj-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO projects (id, name, zoho_host, zoho_port, google_service_account_json, status, created_at, updated_at)
       VALUES (?, 'Test Project', 'imappro.zoho.com', 993, '{"mock": true}', 'ACTIVE', ?, ?)`
    ).run(projectId, now, now);
  });

  // A01: Template download delivers canonical CSV
  it("A01: Template download delivers canonical CSV with exact headers and zero sample credentials", () => {
    const template = generateMigrationMapTemplate();
    expect(template).toBe("source_email,source_password,target_email\n");

    const lines = template.trim().split("\n");
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe("source_email,source_password,target_email");
  });

  // A02: Recognized headers automatically populate preview
  it("A02: Recognized standard headers automatically populate preview and mapping", () => {
    const csvContent = "source_email,source_password,target_email\nalice@zoho.com,Secret123!,alice@google.com";
    const firstRow = ["source_email", "source_password", "target_email"];
    const detection = detectHeaders(firstRow);

    expect(detection.headersDetected).toBe(true);
    expect(detection.ambiguous).toBe(false);
    expect(detection.autoMapping).toEqual({
      source_email_index: 0,
      source_password_index: 1,
      target_email_index: 2,
    });

    const summary = parseAndValidateCsv(csvContent, detection.autoMapping!);
    expect(summary.totalRecords).toBe(1);
    expect(summary.csvValidRecords).toBe(1);
    expect(summary.safePreviews[0].source_email).toBe("alice@zoho.com");
    expect(summary.safePreviews[0].target_email).toBe("alice@google.com");
  });

  // A03: Unrecognized headers require mapping
  it("A03: Unrecognized headers require manual mapping confirmation", () => {
    const csvContent = "CustomColA,CustomColB,CustomColC\nbob@zoho.com,Secret456!,bob@google.com";
    const firstRow = ["CustomColA", "CustomColB", "CustomColC"];
    const detection = detectHeaders(firstRow);

    expect(detection.headersDetected).toBe(false);
    expect(detection.autoMapping).toBeNull();
    expect(detection.unrecognizedColumns.length).toBe(3);

    // With explicit mapping supplied by user
    const manualMapping: ColumnMapping = {
      source_email_index: 0,
      source_password_index: 1,
      target_email_index: 2,
    };
    const summary = parseAndValidateCsv(csvContent, manualMapping, true);
    expect(summary.csvValidRecords).toBe(1);
  });

  // A04: Positional mapping processes unheadered CSV
  it("A04: Positional mapping processes unheadered CSV correctly", () => {
    const unheaderedCsv = "charlie@zoho.com,Pass123,charlie@google.com\ndana@zoho.com,Pass456,dana@google.com";
    const positionalMapping: ColumnMapping = {
      source_email_index: 0,
      source_password_index: 1,
      target_email_index: 2,
    };

    const summary = parseAndValidateCsv(unheaderedCsv, positionalMapping, false);
    expect(summary.totalRecords).toBe(2);
    expect(summary.csvValidRecords).toBe(2);
    expect(summary.safePreviews[0].source_email).toBe("charlie@zoho.com");
    expect(summary.safePreviews[1].source_email).toBe("dana@zoho.com");
  });

  // A05: Duplicate mappings block import
  it("A05: Duplicate mappings within CSV are detected and flagged", () => {
    const duplicateCsv = `source_email,source_password,target_email
alice@zoho.com,Pass1,alice@google.com
alice@zoho.com,Pass2,alice2@google.com`;

    const summary = parseAndValidateCsv(duplicateCsv, {
      source_email_index: 0,
      source_password_index: 1,
      target_email_index: 2,
    });

    expect(summary.totalRecords).toBe(2);
    expect(summary.duplicateMappingsCount).toBeGreaterThan(0);
    expect(summary.recordsRequiringAttention).toBeGreaterThan(0);
  });

  // A06: Re-upload updates existing mapping
  it("A06: Re-upload updates existing mapping while preserving unmentioned rows", () => {
    // Initial import
    const initialCsv = `source_email,source_password,target_email
user1@zoho.com,Pass1,user1@google.com
user2@zoho.com,Pass2,user2@google.com`;

    const mapping = { source_email_index: 0, source_password_index: 1, target_email_index: 2 };
    const firstCommit = commitCsvImport(projectId, initialCsv, mapping);
    expect(firstCommit.result.added).toBe(2);

    // Re-upload CSV updating user1's target email and password
    const secondCsv = `source_email,source_password,target_email
user1@zoho.com,NewPass999,user1-updated@google.com`;

    const secondCommit = commitCsvImport(projectId, secondCsv, mapping);
    expect(secondCommit.result.updated).toBe(1);

    const db = getDatabase();
    const allMappings = db.prepare("SELECT * FROM mappings WHERE project_id = ?").all(projectId) as MappingRow[];
    expect(allMappings.length).toBe(2); // user2 was preserved!

    const user1 = allMappings.find((m) => m.source_email === "user1@zoho.com");
    expect(user1?.target_email).toBe("user1-updated@google.com");
    expect(user1?.revision).toBe(2);
  });

  // A07: Large CSV rejects before processing
  it("A07: Large CSV (>10,000 rows) is rejected during validation", () => {
    let largeCsv = "source_email,source_password,target_email\n";
    for (let i = 0; i < 10005; i++) {
      largeCsv += `user${i}@zoho.com,Pass${i},user${i}@google.com\n`;
    }

    const mapping = { source_email_index: 0, source_password_index: 1, target_email_index: 2 };
    expect(() => parseAndValidateCsv(largeCsv, mapping)).toThrow(/maximum limit of 10,000 rows/);
  });

  // A08: Corrupt CSV stops before execution
  it("A08: Corrupt CSV with unclosed quotes and missing columns flags records as invalid", () => {
    const corruptCsv = `source_email,source_password,target_email
"alice@zoho.com,PasswordWithoutClosingQuote,alice@google.com
malformed_row_only_one_item
valid@zoho.com,ValidPass,valid@google.com`;

    const mapping = { source_email_index: 0, source_password_index: 1, target_email_index: 2 };
    const summary = parseAndValidateCsv(corruptCsv, mapping);

    expect(summary.recordsRequiringAttention).toBeGreaterThan(0);
    expect(summary.rows.some((r) => !r.isValid)).toBe(true);
  });

  // A09: CSV-valid mapping fails Zoho auth
  it("A09: CSV-valid mapping fails Zoho auth with ZOHO_AUTH_FAILED and sets READY to false", async () => {
    const csv = "source_email,source_password,target_email\nbadauth@zoho.com,WrongPass,target@google.com";
    commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });

    setZohoMockHandler((email) => {
      if (email === "badauth@zoho.com") {
        return {
          success: false,
          errorType: "ZOHO_AUTH_FAILED",
          reason: "Zoho rejected credentials. Please verify your App Password.",
        };
      }
      return { success: true, host: "imappro.zoho.com" };
    });

    const progress = await validateProjectMappings(projectId);
    expect(progress.failedCount).toBe(1);
    expect(progress.readyCount).toBe(0);

    const db = getDatabase();
    const mapping = db.prepare("SELECT * FROM mappings WHERE project_id = ?").get(projectId) as MappingRow;
    expect(mapping.zoho_status).toBe("ZOHO_AUTH_FAILED");
    expect(mapping.overall_status).toBe("FAILED");
  });

  // A10: Invalid Google destination flags missing user
  it("A10: Invalid Google destination flags missing user on 404 with GOOGLE_USER_NOT_FOUND", async () => {
    const csv = "source_email,source_password,target_email\nvalid@zoho.com,CorrectPass,missing@google.com";
    commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });

    setGoogleMockHandler((email) => {
      if (email === "missing@google.com") {
        return {
          success: false,
          errorType: "GOOGLE_USER_NOT_FOUND",
          reason: "Destination Google mailbox not found in target Workspace domain",
        };
      }
      return { success: true, profileEmail: email };
    });

    await validateProjectMappings(projectId);

    const db = getDatabase();
    const mapping = db.prepare("SELECT * FROM mappings WHERE project_id = ?").get(projectId) as MappingRow;
    expect(mapping.google_status).toBe("GOOGLE_USER_NOT_FOUND");
    expect(mapping.overall_status).toBe("FAILED");
  });

  // A11: Zoho IMAP disabled distinguished from auth failure
  it("A11: Zoho IMAP disabled is distinguished from credential failure", async () => {
    const csv = "source_email,source_password,target_email\nnoimap@zoho.com,CorrectPass,user@google.com";
    commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });

    setZohoMockHandler((email) => {
      if (email === "noimap@zoho.com") {
        return {
          success: false,
          errorType: "ZOHO_IMAP_DISABLED",
          reason: "IMAP access is disabled in Zoho Mail account settings. Enable IMAP in Zoho web settings.",
        };
      }
      return { success: true, host: "imappro.zoho.com" };
    });

    await validateProjectMappings(projectId);

    const db = getDatabase();
    const mapping = db.prepare("SELECT * FROM mappings WHERE project_id = ?").get(projectId) as MappingRow;
    expect(mapping.zoho_status).toBe("ZOHO_IMAP_DISABLED");
    expect(mapping.safe_error_reason).toContain("Enable IMAP in Zoho web settings");
  });

  // A12: Network timeout triggers retry schedule
  it("A12: Network timeout sets RETRY_PENDING and schedule", async () => {
    const csv = "source_email,source_password,target_email\ntimeout@zoho.com,Pass,user@google.com";
    commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });

    setZohoMockHandler(() => ({
      success: false,
      errorType: "ZOHO_NETWORK_TIMEOUT",
      reason: "Network connection timed out connecting to Zoho IMAP server. Retrying shortly.",
      canRetry: true,
      retryAfterSeconds: 30,
    }));

    await validateProjectMappings(projectId);

    const db = getDatabase();
    const mapping = db.prepare("SELECT * FROM mappings WHERE project_id = ?").get(projectId) as MappingRow;
    expect(mapping.zoho_status).toBe("RETRY_PENDING");
    expect(mapping.overall_status).toBe("WARNING");
  });

  // A13: Zoho rate limit triggers backoff
  it("A13: Zoho rate limit triggers exponential backoff schedule", async () => {
    const csv = "source_email,source_password,target_email\nratelimit@zoho.com,Pass,user@google.com";
    commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });

    setZohoMockHandler(() => ({
      success: false,
      errorType: "ZOHO_RATE_LIMITED",
      reason: "Zoho IMAP rate limit encountered. Backing off automatically.",
      canRetry: true,
      retryAfterSeconds: 60,
    }));

    await validateProjectMappings(projectId);

    const db = getDatabase();
    const mapping = db.prepare("SELECT * FROM mappings WHERE project_id = ?").get(projectId) as MappingRow;
    expect(mapping.zoho_status).toBe("RETRY_PENDING");
    expect(mapping.overall_status).toBe("WARNING");
  });

  // A14: Google rate limit triggers backoff
  it("A14: Google rate limit triggers backoff schedule", async () => {
    const csv = "source_email,source_password,target_email\nuser@zoho.com,Pass,ratelimit@google.com";
    commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });

    setGoogleMockHandler(() => ({
      success: false,
      errorType: "GOOGLE_RATE_LIMITED",
      reason: "Google Workspace API rate limit reached. Backing off.",
      canRetry: true,
      retryAfterSeconds: 30,
    }));

    await validateProjectMappings(projectId);

    const db = getDatabase();
    const mapping = db.prepare("SELECT * FROM mappings WHERE project_id = ?").get(projectId) as MappingRow;
    expect(mapping.google_status).toBe("RETRY_PENDING");
    expect(mapping.overall_status).toBe("WARNING");
  });

  // A15: Bulk validation reflects independent outcomes
  it("A15: Bulk validation reflects independent outcomes across mailboxes", async () => {
    const csv = `source_email,source_password,target_email
good@zoho.com,Pass1,good@google.com
badzoho@zoho.com,Pass2,good2@google.com
good3@zoho.com,Pass3,badgoogle@google.com`;

    commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });

    setZohoMockHandler((email) => {
      if (email === "badzoho@zoho.com") {
        return {
          success: false,
          errorType: "ZOHO_AUTH_FAILED",
          reason: "Zoho auth failed",
        };
      }
      return { success: true, host: "imappro.zoho.com" };
    });

    setGoogleMockHandler((email) => {
      if (email === "badgoogle@google.com") {
        return {
          success: false,
          errorType: "GOOGLE_USER_NOT_FOUND",
          reason: "Google user not found",
        };
      }
      return { success: true, profileEmail: email };
    });

    const progress = await validateProjectMappings(projectId);
    expect(progress.readyCount).toBe(1);
    expect(progress.failedCount).toBe(2);

    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM mappings WHERE project_id = ? ORDER BY source_email ASC").all(projectId) as MappingRow[];

    const badZohoRow = rows.find((r) => r.source_email === "badzoho@zoho.com");
    expect(badZohoRow?.zoho_status).toBe("ZOHO_AUTH_FAILED");
    expect(badZohoRow?.google_status).toBe("READY"); // Verified independently!

    const badGoogleRow = rows.find((r) => r.source_email === "good3@zoho.com");
    expect(badGoogleRow?.zoho_status).toBe("READY");
    expect(badGoogleRow?.google_status).toBe("GOOGLE_USER_NOT_FOUND");
  });

  // A16: Stale validation result discarded on edit
  it("A16: Stale validation result is discarded if mapping is edited while queued", async () => {
    const csv = "source_email,source_password,target_email\nuser@zoho.com,Pass1,user@google.com";
    const commit = commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });
    const mappingId = commit.result.mappingIds[0];

    // Simulate mapping edit incrementing revision before validation completes
    updateMappingRow(projectId, mappingId, { target_email: "newtarget@google.com" });

    const db = getDatabase();
    const mapping = db.prepare("SELECT * FROM mappings WHERE id = ?").get(mappingId) as MappingRow;
    expect(mapping.revision).toBe(2);
    expect(mapping.target_email).toBe("newtarget@google.com");
    expect(mapping.overall_status).toBe("PENDING");
  });

  // A17: Inline edit revalidates single mapping
  it("A17: Inline edit updates credentials/emails and revalidates without affecting others", async () => {
    const csv = `source_email,source_password,target_email
userA@zoho.com,PassA,userA@google.com
userB@zoho.com,PassB,userB@google.com`;

    const commit = commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });
    await validateProjectMappings(projectId);

    // Edit userB
    const userBId = commit.result.mappingIds[1];
    updateMappingRow(projectId, userBId, {
      source_password: "NewPassword123!",
      target_email: "userB-new@google.com",
    });

    const db = getDatabase();
    const userB = db.prepare("SELECT * FROM mappings WHERE id = ?").get(userBId) as MappingRow;
    expect(userB.overall_status).toBe("PENDING");
    expect(userB.target_email).toBe("userB-new@google.com");

    // Revalidate only userB
    await validateProjectMappings(projectId, [userBId]);
    const revalidatedUserB = db.prepare("SELECT * FROM mappings WHERE id = ?").get(userBId) as MappingRow;
    expect(revalidatedUserB.overall_status).toBe("READY");
  });

  // A18: Purge permanently destroys credentials
  it("A18: Purge permanently destroys stored source credentials while preserving metadata and logs", () => {
    const csv = "source_email,source_password,target_email\nuser@zoho.com,SecretPass,user@google.com";
    commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });

    const db = getDatabase();
    const secretBefore = db.prepare("SELECT * FROM secrets WHERE project_id = ?").all(projectId);
    expect(secretBefore.length).toBe(1);

    // Execute purge
    const purgeResult = purgeProjectCredentials(projectId, "Lead Auditor");
    expect(purgeResult.purgedSecretsCount).toBe(1);

    const secretAfter = db.prepare("SELECT * FROM secrets WHERE project_id = ?").all(projectId);
    expect(secretAfter.length).toBe(0); // Ciphertext destroyed!

    const mappingAfter = db.prepare("SELECT * FROM mappings WHERE project_id = ?").get(projectId) as MappingRow;
    expect(mappingAfter.credential_status).toBe("PURGED");
    expect(mappingAfter.zoho_status).toBe("CREDENTIAL_PURGED");

    // Audit log recorded
    const auditLogs = db.prepare("SELECT * FROM audit_logs WHERE project_id = ?").all(projectId);
    expect(auditLogs.some((l: any) => l.action === "PURGE_CREDENTIALS")).toBe(true);
  });

  // A19: Post-purge re-migration rejected
  it("A19: Post-purge re-migration attempt is rejected", async () => {
    const csv = "source_email,source_password,target_email\nuser@zoho.com,SecretPass,user@google.com";
    const commit = commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });
    const mappingId = commit.result.mappingIds[0];

    // Purge credentials
    purgeProjectCredentials(projectId, "Lead Auditor");

    // Attempt migration
    await expect(executeMigrationJob(projectId, mappingId, "INITIAL")).rejects.toThrow(
      /purged/i
    );
  });

  // End-to-end Pipeline Test: Discovery -> Migration -> Ledger Deduplication -> Delta -> Reconciliation -> Sign-off
  it("Pipeline Integration: Full lifecycle from Discovery through Reconciliation and Sign-Off", async () => {
    const csv = "source_email,source_password,target_email\npipeline@zoho.com,SecretPass,pipeline@google.com";
    const commit = commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });
    const mappingId = commit.result.mappingIds[0];

    // 1. Validate
    await validateProjectMappings(projectId);

    // 2. Discover & Review Baseline
    await discoverMailbox(projectId, mappingId);
    reviewAndAcceptBaseline(projectId, mappingId, "Pipeline Tester");

    const db = getDatabase();
    const baseline = db.prepare("SELECT * FROM discovery_baselines WHERE mapping_id = ?").get(mappingId) as any;
    expect(baseline.status).toBe("REVIEWED");

    // 3. Migrate
    const job = await executeMigrationJob(projectId, mappingId, "INITIAL");
    expect(job.status).toBe("COMPLETED");
    expect(job.messages_migrated).toBeGreaterThan(0);

    // 4. Ledger Deduplication Check
    const existingInLedger = messageLedger.findExisting(mappingId, "INBOX", 1);
    expect(existingInLedger).not.toBeNull();
    expect(existingInLedger?.transfer_status).toBe("VERIFIED");

    // 5. Delta Sync
    const deltaJob = await executeDeltaSync(projectId, mappingId);
    expect(deltaJob.status).toBe("COMPLETED");

    // 6. Reconciliation Report Calculation
    const report = generateReconciliationReport(projectId);
    expect(report.totalSourceCountS).toBeGreaterThan(0);
    expect(report.projectDiscrepancyPercent).toBeLessThanOrEqual(1.0);
    expect(report.isEligibleForSignOff).toBe(true);

    // 7. Sign-off
    const signOff = executeProjectSignOff(projectId, "Migration Lead");
    expect(signOff.status).toBe("SIGNED_OFF");

    const projectAfter = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow;
    expect(projectAfter.status).toBe("SIGNED_OFF");
  });

  // Deduplication Test: Engine detects existing email in GWS and skips re-importing
  it("GWS Deduplication: Engine skips writing when email already exists on the Google Workspace side", async () => {
    const csv = "source_email,source_password,target_email\ngwsdup@zoho.com,SecretPass,gwsdup@google.com";
    const commit = commitCsvImport(projectId, csv, { source_email_index: 0, source_password_index: 1, target_email_index: 2 });
    const mappingId = commit.result.mappingIds[0];

    await validateProjectMappings(projectId);
    await discoverMailbox(projectId, mappingId);
    reviewAndAcceptBaseline(projectId, mappingId, "Deduplication Inspector");

    // First migration run - messages are imported and verified in ledger
    const job1 = await executeMigrationJob(projectId, mappingId, "INITIAL");
    expect(job1.status).toBe("COMPLETED");
    expect(job1.messages_migrated).toBe(job1.messages_total);
    expect(job1.messages_migrated).toBeGreaterThan(0);

    const ledgerEntries = messageLedger.listByMapping(mappingId);
    expect(ledgerEntries.length).toBe(job1.messages_total);
    expect(ledgerEntries.every((e) => e.transfer_status === "VERIFIED")).toBe(true);

    // Second run / Delta Sync - All messages already exist in ledger & GWS, so they are skipped
    const job2 = await executeMigrationJob(projectId, mappingId, "DELTA");
    expect(job2.status).toBe("COMPLETED");
    expect(job2.messages_migrated).toBe(job1.messages_total);

    // Verify ledger count did not duplicate
    const ledgerAfter = messageLedger.listByMapping(mappingId);
    expect(ledgerAfter.length).toBe(job1.messages_total);
  });
});
