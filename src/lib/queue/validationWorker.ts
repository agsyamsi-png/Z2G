import { getDatabase, MappingRow, SecretRow, ProjectRow } from "../db";
import { decryptCredential } from "../security/crypto";
import { validateZohoMailbox } from "../providers/zoho";
import { validateGoogleMailbox } from "../providers/google";
import { MailboxValidationResult } from "../providers/types";
import { secureLogger } from "../security/logger";

export interface ValidationJobProgress {
  projectId: string;
  total: number;
  completed: number;
  readyCount: number;
  failedCount: number;
  warningCount: number;
  isRunning: boolean;
  delegationErrorDetected: boolean;
}

const activeJobProgress = new Map<string, ValidationJobProgress>();

export function getProjectValidationProgress(projectId: string): ValidationJobProgress | null {
  return activeJobProgress.get(projectId) || null;
}

/**
 * Validates a single mapping row in isolation.
 * Automatically verifies mapping revision to prevent race conditions or stale overwrites.
 */
export async function validateSingleMapping(
  projectId: string,
  mappingId: string,
  targetRevision?: number
): Promise<MailboxValidationResult> {
  const db = getDatabase();

  const mapping = db
    .prepare("SELECT * FROM mappings WHERE id = ? AND project_id = ?")
    .get(mappingId, projectId) as MappingRow | undefined;

  if (!mapping) {
    throw new Error(`Mapping ${mappingId} not found in project ${projectId}`);
  }

  if (targetRevision !== undefined && mapping.revision !== targetRevision) {
    throw new Error(
      `Mapping revision mismatch: current revision is ${mapping.revision}, job revision was ${targetRevision}`
    );
  }

  const project = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(projectId) as ProjectRow | undefined;

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // Check if credential has been purged
  if (mapping.credential_status === "PURGED") {
    db.prepare(
      `UPDATE mappings SET 
        zoho_status = 'CREDENTIAL_PURGED', 
        overall_status = 'PURGED', 
        safe_error_reason = 'Source credentials have been purged',
        updated_at = ? 
       WHERE id = ?`
    ).run(new Date().toISOString(), mappingId);

    return {
      mappingId,
      revision: mapping.revision,
      zohoResult: {
        success: false,
        errorType: "ZOHO_AUTH_FAILED",
        reason: "Source credentials have been purged",
      },
      googleResult: {
        success: false,
        errorType: "GOOGLE_API_ACCESS_FAILED",
        reason: "Credentials purged",
      },
      overallStatus: "FAILED",
      safeReason: "Credentials purged",
      validatedAt: new Date().toISOString(),
    };
  }

  // Check if mapping is currently actively migrating
  const activeJob = db
    .prepare("SELECT id FROM migration_jobs WHERE mapping_id = ? AND status = 'RUNNING'")
    .get(mappingId) as { id: string } | undefined;

  if (activeJob || mapping.overall_status === "MIGRATING") {
    return {
      mappingId,
      revision: mapping.revision,
      zohoResult: { success: true, host: project.zoho_host },
      googleResult: { success: true, profileEmail: mapping.target_email },
      overallStatus: "MIGRATING",
      safeReason: "Active migration in progress - skipping validation to preserve stream",
      validatedAt: new Date().toISOString(),
    };
  }

  // Mark status as VALIDATING
  db.prepare(
    `UPDATE mappings SET zoho_status = 'VALIDATING', google_status = 'VALIDATING', overall_status = 'VALIDATING', updated_at = ? WHERE id = ?`
  ).run(new Date().toISOString(), mappingId);

  // Retrieve encrypted secret
  const secret = db
    .prepare("SELECT * FROM secrets WHERE mapping_id = ? AND project_id = ?")
    .get(mappingId, projectId) as SecretRow | undefined;

  if (!secret) {
    db.prepare(
      `UPDATE mappings SET 
        credential_status = 'MISSING', 
        zoho_status = 'ZOHO_AUTH_FAILED', 
        overall_status = 'FAILED', 
        safe_error_reason = 'Missing encrypted credential record',
        updated_at = ? 
       WHERE id = ?`
    ).run(new Date().toISOString(), mappingId);

    return {
      mappingId,
      revision: mapping.revision,
      zohoResult: {
        success: false,
        errorType: "ZOHO_AUTH_FAILED",
        reason: "Missing credential record",
      },
      googleResult: {
        success: false,
        errorType: "GOOGLE_API_ACCESS_FAILED",
        reason: "Validation skipped due to missing credential",
      },
      overallStatus: "FAILED",
      safeReason: "Missing credential record",
      validatedAt: new Date().toISOString(),
    };
  }

  // Decrypt credential inside secure worker boundary
  let decryptedPassword = "";
  try {
    decryptedPassword = decryptCredential(
      {
        ciphertext: secret.encrypted_source_credential,
        iv: secret.iv,
        authTag: secret.auth_tag,
        keyRef: secret.key_reference,
      },
      projectId,
      mappingId,
      mapping.revision
    );
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || "Decryption failed";
    db.prepare(
      `UPDATE mappings SET 
        zoho_status = 'ZOHO_AUTH_FAILED', 
        overall_status = 'FAILED', 
        safe_error_reason = ?,
        updated_at = ? 
       WHERE id = ?`
    ).run(errorMsg, new Date().toISOString(), mappingId);

    return {
      mappingId,
      revision: mapping.revision,
      zohoResult: { success: false, errorType: "ZOHO_AUTH_FAILED", reason: errorMsg },
      googleResult: { success: false, errorType: "GOOGLE_API_ACCESS_FAILED", reason: errorMsg },
      overallStatus: "FAILED",
      safeReason: errorMsg,
      validatedAt: new Date().toISOString(),
    };
  }

  // Execute Zoho and Google validations concurrently
  const [zohoResult, googleResult] = await Promise.all([
    validateZohoMailbox(mapping.source_email, decryptedPassword, {
      host: project.zoho_host,
      port: project.zoho_port,
    }),
    validateGoogleMailbox(mapping.target_email, project.google_service_account_json),
  ]);

  // Check if mapping was updated/modified during validation run
  const currentCheck = db
    .prepare("SELECT revision FROM mappings WHERE id = ?")
    .get(mappingId) as { revision: number } | undefined;

  if (currentCheck && currentCheck.revision !== mapping.revision) {
    secureLogger.warn(
      `Discarding validation results for mapping ${mappingId}: revision changed from ${mapping.revision} to ${currentCheck.revision}`
    );
    throw new Error("Validation result discarded due to concurrent mapping revision change");
  }

  // Determine independent statuses
  const isZohoRetry =
    !zohoResult.success &&
    (zohoResult.canRetry ||
      zohoResult.errorType === "ZOHO_NETWORK_TIMEOUT" ||
      zohoResult.errorType === "ZOHO_RATE_LIMITED");

  const isGoogleRetry =
    !googleResult.success &&
    (googleResult.canRetry ||
      googleResult.errorType === "GOOGLE_RATE_LIMITED" ||
      googleResult.errorType === "GOOGLE_API_ACCESS_FAILED" && !!googleResult.canRetry);

  const zohoStatus = zohoResult.success
    ? "READY"
    : isZohoRetry
    ? "RETRY_PENDING"
    : zohoResult.errorType || "ZOHO_AUTH_FAILED";

  const googleStatus = googleResult.success
    ? "READY"
    : isGoogleRetry
    ? "RETRY_PENDING"
    : googleResult.errorType || "GOOGLE_API_ACCESS_FAILED";

  let overallStatus: "READY" | "FAILED" | "WARNING" = "READY";
  let safeReason: string | null = null;

  if (!zohoResult.success || !googleResult.success) {
    if (isZohoRetry || isGoogleRetry) {
      overallStatus = "WARNING";
    } else {
      overallStatus = "FAILED";
    }
    const reasons: string[] = [];
    if (!zohoResult.success) reasons.push(zohoResult.reason || zohoResult.errorType || "Zoho check failed");
    if (!googleResult.success) reasons.push(googleResult.reason || googleResult.errorType || "Google check failed");
    safeReason = reasons.join(" | ");
  }

  const validatedAt = new Date().toISOString();

  // Commit updated results to DB
  db.prepare(
    `UPDATE mappings SET 
      zoho_status = ?, 
      google_status = ?, 
      overall_status = ?, 
      safe_error_reason = ?, 
      validated_at = ?, 
      updated_at = ? 
     WHERE id = ?`
  ).run(zohoStatus, googleStatus, overallStatus, safeReason, validatedAt, validatedAt, mappingId);

  return {
    mappingId,
    revision: mapping.revision,
    zohoResult,
    googleResult,
    overallStatus,
    safeReason: safeReason || undefined,
    validatedAt,
  };
}

/**
 * Validates a batch of mappings with bounded concurrency.
 */
export async function validateProjectMappings(
  projectId: string,
  mappingIds?: string[],
  concurrency = 5
): Promise<ValidationJobProgress> {
  const db = getDatabase();

  let mappingsQuery = `
    SELECT id, revision FROM mappings 
    WHERE project_id = ? 
    AND overall_status != 'MIGRATING'
    AND id NOT IN (SELECT mapping_id FROM migration_jobs WHERE status = 'RUNNING')
  `;
  const params: unknown[] = [projectId];

  if (mappingIds && mappingIds.length > 0) {
    const placeholders = mappingIds.map(() => "?").join(",");
    mappingsQuery += ` AND id IN (${placeholders})`;
    params.push(...mappingIds);
  }

  const mappingsToValidate = db.prepare(mappingsQuery).all(...params) as {
    id: string;
    revision: number;
  }[];

  const progress: ValidationJobProgress = {
    projectId,
    total: mappingsToValidate.length,
    completed: 0,
    readyCount: 0,
    failedCount: 0,
    warningCount: 0,
    isRunning: true,
    delegationErrorDetected: false,
  };

  activeJobProgress.set(projectId, progress);

  // Process with concurrency bounding
  const queue = [...mappingsToValidate];
  let delegationErrorsCount = 0;

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      try {
        const result = await validateSingleMapping(projectId, item.id, item.revision);
        progress.completed++;
        if (result.overallStatus === "READY") {
          progress.readyCount++;
        } else if (result.overallStatus === "WARNING") {
          progress.warningCount++;
        } else {
          progress.failedCount++;
          if (
            !result.googleResult.success &&
            result.googleResult.errorType === "GOOGLE_API_ACCESS_FAILED" &&
            result.googleResult.reason.includes("delegation")
          ) {
            delegationErrorsCount++;
            if (delegationErrorsCount >= 3) {
              progress.delegationErrorDetected = true;
            }
          }
        }
      } catch (err) {
        secureLogger.error(`Validation worker error for mapping ${item.id}:`, (err as Error).message);
        progress.completed++;
        progress.failedCount++;
      }
    }
  }

  const workerCount = Math.min(concurrency, mappingsToValidate.length || 1);
  const workers = Array.from({ length: workerCount }, () => worker());

  await Promise.all(workers);

  progress.isRunning = false;
  activeJobProgress.set(projectId, progress);

  return progress;
}
