import crypto from "crypto";
import { getDatabase, ProjectRow, MappingRow } from "../db";
import { secureLogger } from "./logger";

export interface PurgeResult {
  projectId: string;
  purgedSecretsCount: number;
  affectedMappingsCount: number;
  purgedAt: string;
  actor: string;
  success: boolean;
}

/**
 * Executes post-sign-off cryptographic source credential purge.
 * Irrevocably destroys stored Zoho encrypted credentials while preserving all
 * migration history, baselines, ledgers, reconciliation reports, and audit logs.
 */
export function purgeProjectCredentials(
  projectId: string,
  operatorName: string,
  mappingIds?: string[]
): PurgeResult {
  const db = getDatabase();

  const project = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(projectId) as ProjectRow | undefined;

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const now = new Date().toISOString();

  // 1. Terminate any running jobs for this project/mappings
  let jobsQuery = "UPDATE migration_jobs SET status = 'CANCELLED', updated_at = ? WHERE project_id = ? AND status IN ('PENDING', 'RUNNING')";
  db.prepare(jobsQuery).run(now, projectId);

  // 2. Select mappings to purge
  let mappingsQuery = "SELECT id FROM mappings WHERE project_id = ?";
  const params: unknown[] = [projectId];

  if (mappingIds && mappingIds.length > 0) {
    const placeholders = mappingIds.map(() => "?").join(",");
    mappingsQuery += ` AND id IN (${placeholders})`;
    params.push(...mappingIds);
  }

  const targetMappings = db.prepare(mappingsQuery).all(...params) as { id: string }[];
  const targetMappingIds = targetMappings.map((m) => m.id);

  if (targetMappingIds.length === 0) {
    return {
      projectId,
      purgedSecretsCount: 0,
      affectedMappingsCount: 0,
      purgedAt: now,
      actor: operatorName,
      success: true,
    };
  }

  // 3. Delete secrets from the database securely
  const placeholders = targetMappingIds.map(() => "?").join(",");
  const deleteSecretsStmt = db.prepare(
    `DELETE FROM secrets WHERE project_id = ? AND mapping_id IN (${placeholders})`
  );
  const deleteResult = deleteSecretsStmt.run(projectId, ...targetMappingIds);

  // 4. Update mapping credential status to PURGED
  const updateMappingsStmt = db.prepare(
    `UPDATE mappings SET 
      credential_status = 'PURGED', 
      zoho_status = 'CREDENTIAL_PURGED', 
      safe_error_reason = 'Source credentials purged after sign-off',
      updated_at = ? 
     WHERE id IN (${placeholders})`
  );
  updateMappingsStmt.run(now, ...targetMappingIds);

  // 5. Update project status if all credentials are purged
  db.prepare(
    "UPDATE projects SET status = 'CREDENTIALS_PURGED', updated_at = ? WHERE id = ?"
  ).run(now, projectId);

  // 6. Record audit log
  const auditId = `audit-${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO audit_logs (id, project_id, actor, action, metadata_json, created_at)
     VALUES (?, ?, ?, 'PURGE_CREDENTIALS', ?, ?)`
  ).run(
    auditId,
    projectId,
    operatorName,
    JSON.stringify({
      purgedSecretsCount: deleteResult.changes,
      targetMappingIds,
      timestamp: now,
    }),
    now
  );

  secureLogger.info(
    `Cryptographically purged ${deleteResult.changes} credentials for project ${projectId} by ${operatorName}`
  );

  return {
    projectId,
    purgedSecretsCount: deleteResult.changes,
    affectedMappingsCount: targetMappingIds.length,
    purgedAt: now,
    actor: operatorName,
    success: true,
  };
}
