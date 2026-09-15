import { executeMigrationJob } from "./migrationEngine";
import { getDatabase, MigrationJobRow } from "../db";

/**
 * Runs a delta sync for a previously migrated mapping.
 */
export async function executeDeltaSync(
  projectId: string,
  mappingId: string
): Promise<MigrationJobRow> {
  const db = getDatabase();

  const mapping = db
    .prepare("SELECT * FROM mappings WHERE id = ? AND project_id = ?")
    .get(mappingId, projectId);

  if (!mapping) {
    throw new Error(`Mapping ${mappingId} not found`);
  }

  // Execute migration as DELTA job type
  return executeMigrationJob(projectId, mappingId, "DELTA");
}
