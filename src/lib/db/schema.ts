export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  zoho_host TEXT NOT NULL DEFAULT 'imappro.zoho.com',
  zoho_port INTEGER NOT NULL DEFAULT 993,
  google_service_account_json TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mappings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  source_email TEXT NOT NULL,
  target_email TEXT NOT NULL,
  credential_status TEXT NOT NULL DEFAULT 'PRESENT',
  zoho_status TEXT NOT NULL DEFAULT 'PENDING',
  google_status TEXT NOT NULL DEFAULT 'PENDING',
  overall_status TEXT NOT NULL DEFAULT 'PENDING',
  safe_error_reason TEXT,
  validated_at TEXT,
  discovery_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  baseline_revision INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mappings_project_source ON mappings(project_id, source_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mappings_project_target ON mappings(project_id, target_email);

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  mapping_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  encrypted_source_credential TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_reference TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
  created_at TEXT NOT NULL,
  purged_at TEXT,
  FOREIGN KEY (mapping_id) REFERENCES mappings(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discovery_baselines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  mapping_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  folder_inventory_json TEXT NOT NULL,
  total_messages INTEGER NOT NULL DEFAULT 0,
  total_size_bytes INTEGER NOT NULL DEFAULT 0,
  earliest_date TEXT,
  latest_date TEXT,
  status TEXT NOT NULL DEFAULT 'DISCOVERED',
  reviewed_at TEXT,
  reviewed_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (mapping_id) REFERENCES mappings(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS migration_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  mapping_id TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'INITIAL',
  status TEXT NOT NULL DEFAULT 'PENDING',
  messages_total INTEGER NOT NULL DEFAULT 0,
  messages_migrated INTEGER NOT NULL DEFAULT 0,
  messages_failed INTEGER NOT NULL DEFAULT 0,
  bytes_transferred INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (mapping_id) REFERENCES mappings(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_ledger (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  mapping_id TEXT NOT NULL,
  source_folder TEXT NOT NULL,
  source_uid INTEGER NOT NULL,
  source_message_id TEXT,
  rfc822_hash TEXT NOT NULL,
  target_message_id TEXT,
  target_thread_id TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  transfer_status TEXT NOT NULL DEFAULT 'PENDING',
  write_attempt_token TEXT,
  error_details TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (mapping_id) REFERENCES mappings(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_mapping_msg ON message_ledger(mapping_id, source_folder, source_uid);
CREATE INDEX IF NOT EXISTS idx_ledger_mapping_hash ON message_ledger(mapping_id, rfc822_hash);

CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  report_revision INTEGER NOT NULL DEFAULT 1,
  source_count_s INTEGER NOT NULL DEFAULT 0,
  unresolved_count_u INTEGER NOT NULL DEFAULT 0,
  discrepancy_percent REAL NOT NULL DEFAULT 0.0,
  duplicates_count INTEGER NOT NULL DEFAULT 0,
  corrupted_count INTEGER NOT NULL DEFAULT 0,
  details_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sign_offs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  report_revision INTEGER NOT NULL DEFAULT 1,
  operator_name TEXT NOT NULL,
  accepted_exceptions_json TEXT,
  scope_summary_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SIGNED_OFF',
  signed_off_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  mapping_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
`;
