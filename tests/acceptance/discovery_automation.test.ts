import { describe, it, expect, beforeEach } from "vitest";
import { getDatabase } from "@/lib/db";
import { bulkDiscoverProject } from "@/lib/discovery/discoveryEngine";
import { encryptCredential } from "@/lib/security/crypto";

describe("Automated Discovery Engine", () => {
  const db = getDatabase();
  const testProjectId = "proj-auto-disc-test";

  beforeEach(() => {
    db.prepare("DELETE FROM audit_logs WHERE project_id = ?").run(testProjectId);
    db.prepare("DELETE FROM discovery_baselines WHERE project_id = ?").run(testProjectId);
    db.prepare("DELETE FROM secrets WHERE project_id = ?").run(testProjectId);
    db.prepare("DELETE FROM mappings WHERE project_id = ?").run(testProjectId);
    db.prepare("DELETE FROM projects WHERE id = ?").run(testProjectId);

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO projects (id, name, zoho_host, zoho_port, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(testProjectId, "Auto Discovery Project", "imap.zoho.com", 993, "ACTIVE", now, now);

    // Insert mock mappings
    for (let i = 1; i <= 5; i++) {
      const mappingId = `m-disc-${i}`;
      db.prepare(
        `INSERT INTO mappings (id, project_id, source_email, target_email, zoho_status, google_status, overall_status, discovery_status, revision, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'VALID', 'VALID', 'READY', 'PENDING', 1, ?, ?)`
      ).run(mappingId, testProjectId, `user${i}@andhika.com`, `user${i}@andhika.com`, now, now);

      const encrypted = encryptCredential(`testPass${i}`, testProjectId, mappingId, 1);
      db.prepare(
        `INSERT INTO secrets (id, project_id, mapping_id, encrypted_source_credential, iv, auth_tag, key_reference, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(`sec-${i}`, testProjectId, mappingId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.keyRef, now);
    }
  });

  it("discovers and automatically reviews/locks baselines in parallel for all eligible mailboxes", async () => {
    const result = await bulkDiscoverProject(testProjectId, undefined, true, "Test Operator", 5);

    expect(result.total).toBe(5);
    expect(result.successful).toBe(5);
    expect(result.failed).toBe(0);

    // Verify mappings status transitioned to BASELINE_REVIEWED
    const mappings = db.prepare("SELECT * FROM mappings WHERE project_id = ?").all(testProjectId) as any[];
    expect(mappings.length).toBe(5);
    for (const m of mappings) {
      expect(m.discovery_status).toBe("BASELINE_REVIEWED");
    }

    // Verify baselines table
    const baselines = db.prepare("SELECT * FROM discovery_baselines WHERE project_id = ?").all(testProjectId) as any[];
    expect(baselines.length).toBe(5);
    for (const b of baselines) {
      expect(b.status).toBe("REVIEWED");
      expect(b.reviewed_by).toBe("Test Operator");
      expect(b.total_messages).toBeGreaterThan(0);
    }
  });
});
