import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import { getDatabase, resetDatabaseForTesting, ProjectRow } from "@/lib/db";
import {
  runProjectDiagnostics,
  applyRemediationAction,
} from "@/lib/remediation/remediationEngine";
import { commitCsvImport } from "@/lib/services/importService";

describe("Self-Remediation & Diagnostic Engine Acceptance Tests", () => {
  let projectId: string;

  beforeEach(async () => {
    process.env.MOCK_PROVIDERS = "true";
    resetDatabaseForTesting();

    const db = getDatabase();
    projectId = `proj-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO projects (id, name, zoho_host, zoho_port, google_service_account_json, status, created_at, updated_at)
       VALUES (?, 'Remediation Test Project', 'imappro.zoho.com', 993, NULL, 'ACTIVE', ?, ?)`
    ).run(projectId, now, now);

    // Import sample mailbox mappings
    const csvContent = "source_email,source_password,target_email\nuser1@andhika.com,Pass123!,user1@andhika.com\nuser2@andhika.com,Pass456!,user2@andhika.com";
    commitCsvImport(projectId, csvContent, {
      source_email_index: 0,
      source_password_index: 1,
      target_email_index: 2,
    });
  });

  it("diagnoses candidate Zoho hosts and Google Service Account delegation", async () => {
    const report = await runProjectDiagnostics(projectId);

    expect(report.projectId).toBe(projectId);
    expect(report.projectName).toBe("Remediation Test Project");

    // Zoho diagnostics
    expect(report.zoho.configuredHost).toBe("imappro.zoho.com");
    expect(report.zoho.configuredPort).toBe(993);
    expect(report.zoho.hostChecks.length).toBeGreaterThan(0);
    expect(report.zoho.instructions.length).toBeGreaterThan(0);

    // Google delegation diagnostics
    expect(report.google.clientId).toBe("107205362313237636600");
    expect(report.google.requiredScopes).toContain("https://mail.google.com/");
    expect(report.google.requiredScopes).toContain("https://www.googleapis.com/auth/gmail.insert");
    expect(report.google.resolutionSteps.length).toBeGreaterThan(0);
  });

  it("applies SWITCH_ZOHO_HOST remediation action and updates database", async () => {
    const res = await applyRemediationAction(projectId, "SWITCH_ZOHO_HOST", {
      newHost: "imap.zoho.com",
    });

    expect(res.success).toBe(true);

    const db = getDatabase();
    const updatedProject = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId) as ProjectRow;

    expect(updatedProject.zoho_host).toBe("imap.zoho.com");
  });

  it("applies ENABLE_SIMULATION and RETRY_VALIDATION remediation actions", async () => {
    const simRes = await applyRemediationAction(projectId, "ENABLE_SIMULATION");
    expect(simRes.success).toBe(true);
    expect(process.env.MOCK_PROVIDERS).toBe("true");

    const retryRes = await applyRemediationAction(projectId, "RETRY_VALIDATION");
    expect(retryRes.success).toBe(true);
    expect(retryRes.details.total).toBe(2);
    expect(retryRes.details.readyCount).toBe(2);
  });
});
