import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { CREATE_TABLES_SQL } from "./schema";

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbDir = process.env.DB_DIR || path.join(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = process.env.DB_PATH || path.join(dbDir, "migration.db");
  const db = new Database(dbPath);

  // Enable WAL mode and foreign keys for high performance and integrity
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");

  // Initialize schema
  db.exec(CREATE_TABLES_SQL);

  dbInstance = db;
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function resetDatabaseForTesting(): void {
  const db = getDatabase();
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(`
    DELETE FROM audit_logs;
    DELETE FROM sign_offs;
    DELETE FROM reconciliation_reports;
    DELETE FROM message_ledger;
    DELETE FROM migration_jobs;
    DELETE FROM discovery_baselines;
    DELETE FROM secrets;
    DELETE FROM mappings;
    DELETE FROM projects;
  `);
  db.exec("PRAGMA foreign_keys = ON;");
}

export interface ProjectRow {
  id: string;
  name: string;
  zoho_host: string;
  zoho_port: number;
  google_service_account_json: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MappingRow {
  id: string;
  project_id: string;
  revision: number;
  source_email: string;
  target_email: string;
  credential_status: "PRESENT" | "MISSING" | "PURGED";
  zoho_status:
    | "PENDING"
    | "VALIDATING"
    | "READY"
    | "ZOHO_AUTH_FAILED"
    | "ZOHO_IMAP_DISABLED"
    | "ZOHO_NETWORK_TIMEOUT"
    | "RETRY_PENDING"
    | "CREDENTIAL_PURGED";
  google_status:
    | "PENDING"
    | "VALIDATING"
    | "READY"
    | "GOOGLE_USER_NOT_FOUND"
    | "GOOGLE_API_ACCESS_FAILED"
    | "RETRY_PENDING";
  overall_status:
    | "PENDING"
    | "VALIDATING"
    | "READY"
    | "FAILED"
    | "WARNING"
    | "MIGRATING"
    | "MIGRATED"
    | "RECONCILED"
    | "PURGED";
  safe_error_reason: string | null;
  validated_at: string | null;
  discovery_status: "NOT_STARTED" | "IN_PROGRESS" | "DISCOVERED" | "BASELINE_REVIEWED" | "FAILED";
  baseline_revision: number;
  created_at: string;
  updated_at: string;
}

export interface SecretRow {
  id: string;
  mapping_id: string;
  project_id: string;
  encrypted_source_credential: string;
  iv: string;
  auth_tag: string;
  key_reference: string;
  algorithm: string;
  created_at: string;
  purged_at: string | null;
}

export interface DiscoveryBaselineRow {
  id: string;
  project_id: string;
  mapping_id: string;
  revision: number;
  folder_inventory_json: string;
  total_messages: number;
  total_size_bytes: number;
  earliest_date: string | null;
  latest_date: string | null;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

export interface MigrationJobRow {
  id: string;
  project_id: string;
  mapping_id: string;
  job_type: "INITIAL" | "DELTA";
  status: "PENDING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";
  messages_total: number;
  messages_migrated: number;
  messages_failed: number;
  bytes_transferred: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageLedgerRow {
  id: string;
  project_id: string;
  mapping_id: string;
  source_folder: string;
  source_uid: number;
  source_message_id: string | null;
  rfc822_hash: string;
  target_message_id: string | null;
  target_thread_id: string | null;
  size_bytes: number;
  transfer_status: "VERIFIED" | "PENDING" | "FAILED" | "CORRUPTED" | "SKIPPED";
  write_attempt_token: string | null;
  error_details: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationReportRow {
  id: string;
  project_id: string;
  report_revision: number;
  source_count_s: number;
  unresolved_count_u: number;
  discrepancy_percent: number;
  duplicates_count: number;
  corrupted_count: number;
  details_json: string;
  generated_at: string;
}

export interface SignOffRow {
  id: string;
  project_id: string;
  report_revision: number;
  operator_name: string;
  accepted_exceptions_json: string | null;
  scope_summary_json: string;
  status: string;
  signed_off_at: string;
}

export interface AuditLogRow {
  id: string;
  project_id: string;
  mapping_id: string | null;
  actor: string;
  action: string;
  metadata_json: string | null;
  created_at: string;
}
