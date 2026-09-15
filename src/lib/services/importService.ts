import crypto from "crypto";
import { getDatabase, MappingRow } from "../db";
import { parseAndValidateCsv, ColumnMapping, CsvImportSummary, ValidatedRow } from "../csv/parser";
import { encryptCredential } from "../security/crypto";
import { secureLogger } from "../security/logger";

export interface CommitImportResult {
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  totalValid: number;
  totalAttention: number;
  mappingIds: string[];
}

/**
 * Executes safe, transactional CSV import into SQLite database.
 * Encrypts credentials immediately using AES-256-GCM and discards raw in-memory buffers.
 * Supports re-upload matching existing source emails without deleting omitted rows.
 */
export function commitCsvImport(
  projectId: string,
  csvContent: string,
  mapping: ColumnMapping,
  hasHeaderRow = true
): { summary: CsvImportSummary; result: CommitImportResult } {
  const db = getDatabase();

  // Retrieve existing mappings for duplicate/conflict detection
  const existingMappings = db
    .prepare("SELECT * FROM mappings WHERE project_id = ?")
    .all(projectId) as MappingRow[];

  const existingSourceMap = new Map<string, MappingRow>();
  const existingTargetMap = new Map<string, MappingRow>();

  for (const m of existingMappings) {
    existingSourceMap.set(m.source_email.toLowerCase(), m);
    existingTargetMap.set(m.target_email.toLowerCase(), m);
  }

  const existingSources = new Set(existingSourceMap.keys());
  const existingTargets = new Set(existingTargetMap.keys());

  const summary = parseAndValidateCsv(
    csvContent,
    mapping,
    hasHeaderRow,
    existingSources,
    existingTargets
  );

  let added = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const mappingIds: string[] = [];

  // Transaction for atomic insertion/updates
  const transaction = db.transaction((rows: ValidatedRow[]) => {
    const now = new Date().toISOString();

    for (const row of rows) {
      if (!row.isValid) {
        failed++;
        continue;
      }

      const lowerSource = row.source_email.toLowerCase();
      const existing = existingSourceMap.get(lowerSource);

      if (existing) {
        // Safe re-upload update: update mapping revision, target email, reset statuses, encrypt new credential
        const nextRevision = existing.revision + 1;
        mappingIds.push(existing.id);

        db.prepare(
          `UPDATE mappings SET 
            target_email = ?, 
            revision = ?, 
            credential_status = 'PRESENT', 
            zoho_status = 'PENDING', 
            google_status = 'PENDING', 
            overall_status = 'PENDING', 
            safe_error_reason = NULL, 
            validated_at = NULL, 
            discovery_status = 'NOT_STARTED', 
            baseline_revision = 0, 
            updated_at = ? 
           WHERE id = ?`
        ).run(row.target_email, nextRevision, now, existing.id);

        // Encrypt and replace secret
        const encryptedSecret = encryptCredential(
          row.source_password,
          projectId,
          existing.id,
          nextRevision
        );

        db.prepare(
          `INSERT OR REPLACE INTO secrets (
            id, mapping_id, project_id, encrypted_source_credential, 
            iv, auth_tag, key_reference, algorithm, created_at, purged_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
        ).run(
          `sec-${crypto.randomUUID()}`,
          existing.id,
          projectId,
          encryptedSecret.ciphertext,
          encryptedSecret.iv,
          encryptedSecret.authTag,
          encryptedSecret.keyRef,
          encryptedSecret.algorithm,
          now
        );

        updated++;
      } else {
        // New mapping insertion
        const mappingId = `map-${crypto.randomUUID()}`;
        mappingIds.push(mappingId);

        db.prepare(
          `INSERT INTO mappings (
            id, project_id, revision, source_email, target_email, 
            credential_status, zoho_status, google_status, overall_status, 
            safe_error_reason, validated_at, discovery_status, baseline_revision, 
            created_at, updated_at
          ) VALUES (?, ?, 1, ?, ?, 'PRESENT', 'PENDING', 'PENDING', 'PENDING', NULL, NULL, 'NOT_STARTED', 0, ?, ?)`
        ).run(mappingId, projectId, row.source_email, row.target_email, now, now);

        // Encrypt secret
        const encryptedSecret = encryptCredential(
          row.source_password,
          projectId,
          mappingId,
          1
        );

        db.prepare(
          `INSERT INTO secrets (
            id, mapping_id, project_id, encrypted_source_credential, 
            iv, auth_tag, key_reference, algorithm, created_at, purged_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
        ).run(
          `sec-${crypto.randomUUID()}`,
          mappingId,
          projectId,
          encryptedSecret.ciphertext,
          encryptedSecret.iv,
          encryptedSecret.authTag,
          encryptedSecret.keyRef,
          encryptedSecret.algorithm,
          now
        );

        added++;
      }
    }

    // Record audit log
    db.prepare(
      `INSERT INTO audit_logs (id, project_id, actor, action, metadata_json, created_at)
       VALUES (?, ?, 'operator', 'CSV_IMPORT', ?, ?)`
    ).run(
      `audit-${crypto.randomUUID()}`,
      projectId,
      JSON.stringify({ added, updated, failed, total: rows.length }),
      now
    );
  });

  transaction(summary.rows);

  return {
    summary,
    result: {
      added,
      updated,
      skipped,
      failed,
      totalValid: summary.csvValidRecords,
      totalAttention: summary.recordsRequiringAttention,
      mappingIds,
    },
  };
}

/**
 * In-place manual row correction (source or target email update, or replacement credential).
 * Never prefills credential input.
 */
export function updateMappingRow(
  projectId: string,
  mappingId: string,
  updates: {
    source_email?: string;
    target_email?: string;
    source_password?: string;
  }
): MappingRow {
  const db = getDatabase();

  const mapping = db
    .prepare("SELECT * FROM mappings WHERE id = ? AND project_id = ?")
    .get(mappingId, projectId) as MappingRow | undefined;

  if (!mapping) throw new Error("Mapping not found");

  if (mapping.overall_status === "MIGRATING") {
    throw new Error("Cannot modify mapping while migration is actively running");
  }

  const now = new Date().toISOString();
  const nextRevision = mapping.revision + 1;

  const newSource = updates.source_email?.trim() || mapping.source_email;
  const newTarget = updates.target_email?.trim() || mapping.target_email;

  db.prepare(
    `UPDATE mappings SET 
      source_email = ?, 
      target_email = ?, 
      revision = ?, 
      zoho_status = 'PENDING', 
      google_status = 'PENDING', 
      overall_status = 'PENDING', 
      safe_error_reason = NULL, 
      validated_at = NULL, 
      discovery_status = 'NOT_STARTED', 
      baseline_revision = 0, 
      updated_at = ? 
     WHERE id = ?`
  ).run(newSource, newTarget, nextRevision, now, mappingId);

  // If a replacement password was provided, encrypt and store
  if (updates.source_password) {
    const encryptedSecret = encryptCredential(
      updates.source_password,
      projectId,
      mappingId,
      nextRevision
    );

    db.prepare(
      `INSERT OR REPLACE INTO secrets (
        id, mapping_id, project_id, encrypted_source_credential, 
        iv, auth_tag, key_reference, algorithm, created_at, purged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    ).run(
      `sec-${crypto.randomUUID()}`,
      mappingId,
      projectId,
      encryptedSecret.ciphertext,
      encryptedSecret.iv,
      encryptedSecret.authTag,
      encryptedSecret.keyRef,
      encryptedSecret.algorithm,
      now
    );

    db.prepare("UPDATE mappings SET credential_status = 'PRESENT' WHERE id = ?").run(mappingId);
  }

  return db.prepare("SELECT * FROM mappings WHERE id = ?").get(mappingId) as MappingRow;
}
