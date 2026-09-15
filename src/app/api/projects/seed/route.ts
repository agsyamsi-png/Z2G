import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDatabase } from "@/lib/db";
import { commitCsvImport } from "@/lib/services/importService";
import { discoverMailbox, reviewAndAcceptBaseline } from "@/lib/discovery/discoveryEngine";
import { executeMigrationJob } from "@/lib/migration/migrationEngine";
import { generateReconciliationReport } from "@/lib/reconciliation/reconciliationEngine";

export async function POST() {
  try {
    process.env.MOCK_PROVIDERS = "true";
    const db = getDatabase();
    const projectId = `proj-demo-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    // 1. Create Demo Project
    db.prepare(
      `INSERT INTO projects (id, name, zoho_host, zoho_port, google_service_account_json, status, created_at, updated_at)
       VALUES (?, 'Acme Global — Enterprise Zoho to Google Migration', 'imappro.zoho.com', 993, '{"type": "service_account", "client_email": "migration-sa@acmeglobal.iam.gserviceaccount.com"}', 'ACTIVE', ?, ?)`
    ).run(projectId, now, now);

    // 2. Sample 8-user CSV with diverse statuses
    const sampleCsv = `source_email,source_password,target_email
ceo@acme-corp.com,ExecSecretPass2026!,ceo@acmeglobal.com
cto@acme-corp.com,TechLeader999$,cto@acmeglobal.com
cfo@acme-corp.com,Finance2026@Pass,cfo@acmeglobal.com
sarah.dev@acme-corp.com,CodingRocks!123,sarah.jenkins@acmeglobal.com
alex.ops@acme-corp.com,DevOpsAdmin456!,alex.rivera@acmeglobal.com
sales.lead@acme-corp.com,CloseDeals789!,sales.lead@acmeglobal.com
support.tier1@acme-corp.com,SupportDesk111!,support@acmeglobal.com
hr.director@acme-corp.com,PeopleFirst888!,hr@acmeglobal.com`;

    const columnMapping = {
      source_email_index: 0,
      source_password_index: 1,
      target_email_index: 2,
    };

    const importResult = commitCsvImport(projectId, sampleCsv, columnMapping);
    const mappingIds = importResult.result.mappingIds;

    // 3. Mark 6 mailboxes as READY with varying discovery & migration states
    const readyMappingIds = mappingIds.slice(0, 6);
    const failedMapping1 = mappingIds[6]; // Zoho Auth issue
    const failedMapping2 = mappingIds[7]; // Google missing user

    for (const mId of readyMappingIds) {
      db.prepare(
        `UPDATE mappings SET zoho_status = 'READY', google_status = 'READY', overall_status = 'READY', safe_error_reason = NULL, validated_at = ? WHERE id = ?`
      ).run(now, mId);

      // Perform discovery on first 4
      if (readyMappingIds.indexOf(mId) < 4) {
        await discoverMailbox(projectId, mId);
        reviewAndAcceptBaseline(projectId, mId, "Demo Admin");

        // Execute initial migration for first 2
        if (readyMappingIds.indexOf(mId) < 2) {
          await executeMigrationJob(projectId, mId, "INITIAL");
        }
      }
    }

    // Set failed statuses for the remaining 2
    if (failedMapping1) {
      db.prepare(
        `UPDATE mappings SET zoho_status = 'ZOHO_AUTH_FAILED', google_status = 'READY', overall_status = 'FAILED', safe_error_reason = 'Zoho rejected authentication. Check password or use an App Password.', validated_at = ? WHERE id = ?`
      ).run(now, failedMapping1);
    }

    if (failedMapping2) {
      db.prepare(
        `UPDATE mappings SET zoho_status = 'READY', google_status = 'GOOGLE_USER_NOT_FOUND', overall_status = 'FAILED', safe_error_reason = 'Google Workspace user account does not exist in target domain', validated_at = ? WHERE id = ?`
      ).run(now, failedMapping2);
    }

    // Log seed event
    db.prepare(
      `INSERT INTO audit_logs (id, project_id, actor, action, metadata_json, created_at)
       VALUES (?, ?, 'System', 'SEED_DEMO_PROJECT', '{"mailboxes": 8, "pre_migrated": 2}', ?)`
    ).run(`log-${crypto.randomUUID()}`, projectId, now);

    return NextResponse.json({
      success: true,
      projectId,
      message: "Demo project seeded successfully with 8 mailboxes and simulated pipeline progress.",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to seed demo project" },
      { status: 500 }
    );
  }
}
