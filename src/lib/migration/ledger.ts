import crypto from "crypto";
import { getDatabase, MessageLedgerRow } from "../db";

export interface LedgerEntry {
  projectId: string;
  mappingId: string;
  sourceFolder: string;
  sourceUid: number;
  sourceMessageId?: string | null;
  rfc822Content: string | Buffer;
  targetMessageId?: string | null;
  targetThreadId?: string | null;
  sizeBytes?: number;
  transferStatus: "VERIFIED" | "PENDING" | "FAILED" | "CORRUPTED" | "SKIPPED";
  writeAttemptToken?: string;
  errorDetails?: string | null;
}

/**
 * Computes deterministic SHA-256 hash of raw RFC822 message content.
 */
export function computeRfc822Hash(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export const messageLedger = {
  /**
   * Checks whether a message was already successfully transferred or is recorded in the ledger.
   */
  findExisting(
    mappingId: string,
    sourceFolder: string,
    sourceUid: number
  ): MessageLedgerRow | undefined {
    const db = getDatabase();
    return db
      .prepare(
        "SELECT * FROM message_ledger WHERE mapping_id = ? AND source_folder = ? AND source_uid = ?"
      )
      .get(mappingId, sourceFolder, sourceUid) as MessageLedgerRow | undefined;
  },

  /**
   * Fast retrieval of all verified UIDs for a specific folder.
   * Enables delta UID pre-filtering so existing emails are skipped without downloading raw bodies.
   */
  getVerifiedUids(mappingId: string, sourceFolder: string): Set<number> {
    const db = getDatabase();
    const rows = db
      .prepare(
        "SELECT source_uid FROM message_ledger WHERE mapping_id = ? AND source_folder = ? AND transfer_status = 'VERIFIED'"
      )
      .all(mappingId, sourceFolder) as Array<{ source_uid: number }>;
    return new Set(rows.map((r) => r.source_uid));
  },

  /**
   * Looks up an entry by RFC822 hash and mapping to avoid duplicate writes.
   */
  findByHash(mappingId: string, rfc822Hash: string): MessageLedgerRow | undefined {
    const db = getDatabase();
    return db
      .prepare(
        "SELECT * FROM message_ledger WHERE mapping_id = ? AND rfc822_hash = ? AND transfer_status = 'VERIFIED'"
      )
      .get(mappingId, rfc822Hash) as MessageLedgerRow | undefined;
  },

  /**
   * Records or updates a message in the ledger.
   */
  recordWriteAttempt(entry: LedgerEntry): MessageLedgerRow {
    const db = getDatabase();
    const hash =
      typeof entry.rfc822Content === "string" || Buffer.isBuffer(entry.rfc822Content)
        ? computeRfc822Hash(entry.rfc822Content)
        : "hash_missing";

    const contentLen =
      Buffer.isBuffer(entry.rfc822Content)
        ? entry.rfc822Content.length
        : typeof entry.rfc822Content === "string"
        ? Buffer.byteLength(entry.rfc822Content, "utf-8")
        : 0;

    const existing = db
      .prepare(
        "SELECT * FROM message_ledger WHERE mapping_id = ? AND source_folder = ? AND source_uid = ?"
      )
      .get(entry.mappingId, entry.sourceFolder, entry.sourceUid) as MessageLedgerRow | undefined;

    const now = new Date().toISOString();

    if (existing) {
      db.prepare(
        `UPDATE message_ledger SET 
          rfc822_hash = ?, 
          target_message_id = COALESCE(?, target_message_id), 
          target_thread_id = COALESCE(?, target_thread_id), 
          size_bytes = ?, 
          transfer_status = ?, 
          write_attempt_token = ?, 
          error_details = ?, 
          updated_at = ? 
         WHERE id = ?`
      ).run(
        hash,
        entry.targetMessageId || null,
        entry.targetThreadId || null,
        entry.sizeBytes || contentLen,
        entry.transferStatus,
        entry.writeAttemptToken || null,
        entry.errorDetails || null,
        now,
        existing.id
      );

      return db.prepare("SELECT * FROM message_ledger WHERE id = ?").get(existing.id) as MessageLedgerRow;
    }

    const id = `led-${crypto.randomUUID()}`;
    db.prepare(
      `INSERT INTO message_ledger (
        id, project_id, mapping_id, source_folder, source_uid, 
        source_message_id, rfc822_hash, target_message_id, target_thread_id, 
        size_bytes, transfer_status, write_attempt_token, error_details, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      entry.projectId,
      entry.mappingId,
      entry.sourceFolder,
      entry.sourceUid,
      entry.sourceMessageId || null,
      hash,
      entry.targetMessageId || null,
      entry.targetThreadId || null,
      entry.sizeBytes || contentLen,
      entry.transferStatus,
      entry.writeAttemptToken || null,
      entry.errorDetails || null,
      now,
      now
    );

    return db.prepare("SELECT * FROM message_ledger WHERE id = ?").get(id) as MessageLedgerRow;
  },

  /**
   * Retrieves all ledger entries for a mapping.
   */
  listByMapping(mappingId: string): MessageLedgerRow[] {
    const db = getDatabase();
    return db
      .prepare("SELECT * FROM message_ledger WHERE mapping_id = ? ORDER BY source_uid ASC")
      .all(mappingId) as MessageLedgerRow[];
  },

  /**
   * Retrieves all ledger entries for a project.
   */
  listByProject(projectId: string): MessageLedgerRow[] {
    const db = getDatabase();
    return db
      .prepare("SELECT * FROM message_ledger WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as MessageLedgerRow[];
  },
};
