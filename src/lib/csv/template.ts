/**
 * Generates canonical migration map CSV template with exact header and no sample credentials.
 */
export function generateMigrationMapTemplate(): string {
  return "source_email,source_password,target_email\n";
}
