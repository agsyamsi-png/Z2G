import { describe, it, expect, beforeEach } from "vitest";
import { getDatabase } from "@/lib/db";
import {
  startBulkMigration,
  pauseBulkMigration,
  resumeBulkMigration,
  stopBulkMigration,
  setBulkMigrationConcurrency,
  getBulkMigrationStatus,
} from "@/lib/migration/bulkMigrationEngine";
import crypto from "crypto";

describe("Bulk Migration Queue Engine", () => {
  let projectId: string;

  beforeEach(() => {
    projectId = `proj-bulk-test-${crypto.randomUUID()}`;
    const db = getDatabase();
    const now = new Date().toISOString();

    // Setup dummy project
    db.prepare(
      `INSERT INTO projects (id, name, zoho_host, zoho_port, created_at, updated_at)
       VALUES (?, 'Bulk Test Project', 'imap.zoho.com', 993, ?, ?)`
    ).run(projectId, now, now);

    // Setup 3 dummy mappings with REVIEWED baselines
    for (let i = 1; i <= 3; i++) {
      const mappingId = `map-bulk-${i}-${crypto.randomUUID()}`;
      db.prepare(
        `INSERT INTO mappings (
          id, project_id, revision, source_email, target_email,
          credential_status, zoho_status, google_status, overall_status,
          discovery_status, baseline_revision, created_at, updated_at
        ) VALUES (?, ?, 1, ?, ?, 'PRESENT', 'READY', 'READY', 'READY', 'BASELINE_REVIEWED', 1, ?, ?)`
      ).run(
        mappingId,
        projectId,
        `user${i}_${crypto.randomUUID().slice(0, 5)}@andhika.com`,
        `user${i}_${crypto.randomUUID().slice(0, 5)}@andhika.com`,
        now,
        now
      );

      // Add baseline
      db.prepare(
        `INSERT INTO discovery_baselines (
          id, project_id, mapping_id, revision, folder_inventory_json, total_messages, total_size_bytes, status, created_at
        ) VALUES (?, ?, ?, 1, '[]', 100, 1000000, 'REVIEWED', ?)`
      ).run(`base-bulk-${i}-${crypto.randomUUID()}`, projectId, mappingId, now);
    }
  });

  it("retrieves bulk migration status for project with eligible mailboxes", () => {
    const status = getBulkMigrationStatus(projectId);
    expect(status.projectId).toBe(projectId);
    expect(status.totalEligible).toBe(3);
    expect(status.completedCount).toBe(0);
    expect(status.state).toBe("IDLE");
  });

  it("handles pause, resume, and stop controls gracefully", async () => {
    // Start bulk migration
    const started = await startBulkMigration(projectId, { concurrency: 2 });
    expect(started.state).toBeDefined();
    expect(started.totalEligible).toBe(3);

    // Pause
    const paused = pauseBulkMigration(projectId);
    expect(paused.state).toBe("PAUSED");

    // Resume
    const resumed = resumeBulkMigration(projectId);
    expect(resumed.state).toBe("RUNNING");

    // Concurrency adjustment
    const updated = setBulkMigrationConcurrency(projectId, 4);
    expect(updated.concurrency).toBe(4);

    // Stop
    const stopped = stopBulkMigration(projectId);
    expect(stopped.state).toBe("STOPPED");
  });
});
