import { getDatabase, MappingRow, MigrationJobRow } from "@/lib/db";
import { executeMigrationJob, cancelMigrationJob, liveTransferStates, activeMigrationJobs } from "./migrationEngine";

export interface ActiveWorkerInfo {
  mappingId: string;
  sourceEmail: string;
  targetEmail: string;
  jobId: string;
  stage: string;
  currentFolder: string;
  currentUid: number;
  currentSubject: string;
  migrated: number;
  total: number;
  bytesTransferred: number;
}

export interface BulkMigrationStatus {
  projectId: string;
  state: "IDLE" | "RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED";
  isQueueRunning: boolean;
  isQueuePaused: boolean;
  hasActiveWorkers: boolean;
  concurrency: number;
  totalEligible: number;
  completedCount: number;
  inFlightCount: number;
  pendingCount: number;
  failedCount: number;
  totalMessagesMigrated: number;
  totalBytesTransferred: number;
  activeWorkers: ActiveWorkerInfo[];
  recentCompleted: Array<{
    mappingId: string;
    sourceEmail: string;
    targetEmail: string;
    messagesMigrated: number;
    bytesTransferred: number;
    finishedAt: string;
  }>;
  startedAt: string | null;
  updatedAt: string;
}

interface ProjectQueue {
  projectId: string;
  state: "IDLE" | "RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED";
  concurrency: number;
  queuedMappingIds: string[];
  inFlightMappingIds: Set<string>;
  completedMappingIds: Set<string>;
  failedMappingIds: Set<string>;
  startedAt: string | null;
}

const globalForBulk = globalThis as unknown as {
  __projectQueues?: Map<string, ProjectQueue>;
  __activeMonitors?: Map<string, NodeJS.Timeout>;
};

const projectQueues: Map<string, ProjectQueue> =
  globalForBulk.__projectQueues || (globalForBulk.__projectQueues = new Map());

// Active pollers for in-flight jobs
const activeMonitors: Map<string, NodeJS.Timeout> =
  globalForBulk.__activeMonitors || (globalForBulk.__activeMonitors = new Map());

function getOrCreateQueue(projectId: string, concurrency: number = 2): ProjectQueue {
  let queue = projectQueues.get(projectId);
  if (!queue) {
    const db = getDatabase();
    // Reconcile any orphaned jobs from previous process restarts
    const runningJobs = db
      .prepare(
        "SELECT id, mapping_id FROM migration_jobs WHERE project_id = ? AND status = 'RUNNING'"
      )
      .all(projectId) as Array<{ id: string; mapping_id: string }>;

    const inFlight = new Set<string>();
    for (const r of runningJobs) {
      if (activeMigrationJobs.has(r.id)) {
        inFlight.add(r.mapping_id);
        monitorExistingInFlightJob(projectId, r.mapping_id);
      } else {
        // Mark interrupted job as CANCELLED so it can be cleanly queued/migrated
        db.prepare(
          "UPDATE migration_jobs SET status = 'CANCELLED', error_message = 'Interrupted by process restart', updated_at = ? WHERE id = ?"
        ).run(new Date().toISOString(), r.id);
        db.prepare(
          "UPDATE mappings SET overall_status = 'READY', updated_at = ? WHERE id = ? AND overall_status = 'MIGRATING'"
        ).run(new Date().toISOString(), r.mapping_id);
      }
    }

    const isRunning = inFlight.size > 0;

    queue = {
      projectId,
      state: isRunning ? "RUNNING" : "IDLE",
      concurrency,
      queuedMappingIds: [],
      inFlightMappingIds: inFlight,
      completedMappingIds: new Set<string>(),
      failedMappingIds: new Set<string>(),
      startedAt: isRunning ? new Date().toISOString() : null,
    };
    projectQueues.set(projectId, queue);
  }
  return queue;
}

function monitorExistingInFlightJob(projectId: string, mappingId: string) {
  if (activeMonitors.has(mappingId)) return;

  const db = getDatabase();
  const timer = setInterval(() => {
    try {
      const queue = projectQueues.get(projectId);
      const activeJob = db
        .prepare(
          "SELECT * FROM migration_jobs WHERE mapping_id = ? AND status = 'RUNNING' ORDER BY updated_at DESC LIMIT 1"
        )
        .get(mappingId) as MigrationJobRow | undefined;

      if (!activeJob) {
        clearInterval(timer);
        activeMonitors.delete(mappingId);

        if (queue) {
          queue.inFlightMappingIds.delete(mappingId);

          const finishedJob = db
            .prepare(
              "SELECT * FROM migration_jobs WHERE mapping_id = ? ORDER BY finished_at DESC LIMIT 1"
            )
            .get(mappingId) as MigrationJobRow | undefined;

          if (finishedJob?.status === "COMPLETED") {
            queue.completedMappingIds.add(mappingId);
          } else {
            queue.failedMappingIds.add(mappingId);
          }

          if (queue.state === "RUNNING") {
            pumpQueue(projectId);
          }
        }
      }
    } catch {
      clearInterval(timer);
      activeMonitors.delete(mappingId);
    }
  }, 2000);

  activeMonitors.set(mappingId, timer);
}

/**
 * Starts or resumes bulk migration across all eligible mailboxes in a project.
 */
export async function startBulkMigration(
  projectId: string,
  options?: { concurrency?: number; mappingIds?: string[] }
): Promise<BulkMigrationStatus> {
  const db = getDatabase();
  const concurrency = Math.max(1, Math.min(4, options?.concurrency || 2));
  const queue = getOrCreateQueue(projectId, concurrency);
  queue.concurrency = concurrency;

  // Check which mailboxes currently have active running jobs in SQLite
  const runningJobRows = db
    .prepare(
      "SELECT DISTINCT mapping_id FROM migration_jobs WHERE project_id = ? AND status = 'RUNNING'"
    )
    .all(projectId) as Array<{ mapping_id: string }>;

  for (const r of runningJobRows) {
    queue.inFlightMappingIds.add(r.mapping_id);
    monitorExistingInFlightJob(projectId, r.mapping_id);
    db.prepare(
      "UPDATE mappings SET overall_status = 'MIGRATING', updated_at = ? WHERE id = ? AND overall_status != 'MIGRATING'"
    ).run(new Date().toISOString(), r.mapping_id);
  }

  // If specific mappingIds are requested:
  if (options?.mappingIds && options.mappingIds.length > 0) {
    for (const id of options.mappingIds) {
      if (
        !queue.inFlightMappingIds.has(id) &&
        !queue.completedMappingIds.has(id) &&
        !queue.queuedMappingIds.includes(id)
      ) {
        queue.queuedMappingIds.push(id);
      }
    }
  } else if (queue.state === "RUNNING") {
    // Already running domain-wide queue, simply return current status
    return getBulkMigrationStatus(projectId);
  }

  // If queue has no pending items yet, load all eligible mappings
  if (queue.queuedMappingIds.length === 0) {
    const allEligible = db
      .prepare(
        `SELECT m.id, m.source_email, m.target_email, m.overall_status, m.discovery_status
         FROM mappings m
         WHERE m.project_id = ?
           AND m.credential_status != 'PURGED'
           AND (m.overall_status = 'READY' OR m.overall_status = 'MIGRATING')
           AND m.discovery_status = 'BASELINE_REVIEWED'
         ORDER BY CASE WHEN m.overall_status = 'MIGRATING' THEN 0 ELSE 1 END, m.created_at ASC`
      )
      .all(projectId) as Array<{
        id: string;
        source_email: string;
        target_email: string;
        overall_status: string;
        discovery_status: string;
      }>;

    let targetIds = allEligible.map((m) => m.id);
    if (options?.mappingIds && options.mappingIds.length > 0) {
      const filterSet = new Set(options.mappingIds);
      targetIds = targetIds.filter((id) => filterSet.has(id));
    }

    queue.queuedMappingIds = targetIds.filter(
      (id) => !queue.completedMappingIds.has(id) && !queue.inFlightMappingIds.has(id)
    );
  }

  queue.state = "RUNNING";
  if (!queue.startedAt) queue.startedAt = new Date().toISOString();

  // Pump queue asynchronously
  pumpQueue(projectId);

  return getBulkMigrationStatus(projectId);
}

/**
 * Pauses the queue. In-flight mailboxes continue until finished, but no new mailboxes start.
 */
export function pauseBulkMigration(projectId: string): BulkMigrationStatus {
  const queue = projectQueues.get(projectId);
  if (queue && queue.state === "RUNNING") {
    queue.state = "PAUSED";
  }
  return getBulkMigrationStatus(projectId);
}

/**
 * Resumes a paused queue.
 */
export function resumeBulkMigration(projectId: string): BulkMigrationStatus {
  const queue = projectQueues.get(projectId);
  if (queue && queue.state === "PAUSED") {
    queue.state = "RUNNING";
    pumpQueue(projectId);
  }
  return getBulkMigrationStatus(projectId);
}

/**
 * Stops the bulk migration queue and cancels active in-flight jobs.
 */
export function stopBulkMigration(projectId: string): BulkMigrationStatus {
  const queue = projectQueues.get(projectId);
  const db = getDatabase();

  if (queue) {
    queue.state = "STOPPED";
    queue.queuedMappingIds = [];

    // Cancel active jobs in database
    for (const mappingId of queue.inFlightMappingIds) {
      const activeJob = db
        .prepare("SELECT id FROM migration_jobs WHERE mapping_id = ? AND status = 'RUNNING'")
        .get(mappingId) as { id: string } | undefined;

      if (activeJob) {
        cancelMigrationJob(activeJob.id);
      }
    }
    queue.inFlightMappingIds.clear();

    for (const [, timer] of activeMonitors.entries()) {
      clearInterval(timer);
    }
    activeMonitors.clear();
  }

  return getBulkMigrationStatus(projectId);
}

/**
 * Sets concurrency dynamically on the running or paused queue.
 */
export function setBulkMigrationConcurrency(projectId: string, concurrency: number): BulkMigrationStatus {
  const clamped = Math.max(1, Math.min(4, concurrency));
  const queue = getOrCreateQueue(projectId, clamped);
  queue.concurrency = clamped;
  if (queue.state === "RUNNING") {
    pumpQueue(projectId);
  }
  return getBulkMigrationStatus(projectId);
}

/**
 * Pumps the queue: dispatches workers up to the concurrency limit.
 */
function pumpQueue(projectId: string) {
  const queue = projectQueues.get(projectId);
  if (!queue || queue.state !== "RUNNING") return;

  while (queue.inFlightMappingIds.size < queue.concurrency && queue.queuedMappingIds.length > 0) {
    const nextMappingId = queue.queuedMappingIds.shift();
    if (!nextMappingId) break;

    queue.inFlightMappingIds.add(nextMappingId);

    // Launch worker without blocking pump loop
    executeWorker(projectId, nextMappingId).catch((err) => {
      console.error(`[BULK WORKER ERROR] Mailbox ${nextMappingId}:`, err);
    });
  }

  if (queue.inFlightMappingIds.size === 0 && queue.queuedMappingIds.length === 0) {
    const db = getDatabase();
    const activeDbJobs = db
      .prepare(
        "SELECT count(*) as count FROM migration_jobs WHERE project_id = ? AND status = 'RUNNING'"
      )
      .get(projectId) as { count: number };

    if (activeDbJobs.count === 0) {
      queue.state = "COMPLETED";
    }
  }
}

/**
 * Executes migration for an individual mailbox worker.
 */
async function executeWorker(projectId: string, mappingId: string) {
  const queue = projectQueues.get(projectId);

  try {
    const job = await executeMigrationJob(projectId, mappingId, "INITIAL");
    if (queue) {
      if (job.status === "RUNNING") {
        // Job is already running in background (e.g. from prior trigger)
        // Keep in inFlightMappingIds and attach monitor to wait for completion
        monitorExistingInFlightJob(projectId, mappingId);
        return;
      }

      queue.inFlightMappingIds.delete(mappingId);
      if (job.status === "COMPLETED") {
        queue.completedMappingIds.add(mappingId);
      } else {
        queue.failedMappingIds.add(mappingId);
      }
    }
  } catch (err) {
    console.error(`[BULK WORKER EXCEPTION] ${mappingId}:`, err);
    if (queue) {
      queue.inFlightMappingIds.delete(mappingId);
      queue.failedMappingIds.add(mappingId);
    }
  } finally {
    // Continue pumping queue
    if (queue && queue.state === "RUNNING") {
      pumpQueue(projectId);
    }
  }
}

/**
 * Returns comprehensive status of the bulk migration queue and domain-wide stats.
 */
export function getBulkMigrationStatus(projectId: string): BulkMigrationStatus {
  const db = getDatabase();
  const queue = getOrCreateQueue(projectId);

  // Overall database totals for the project
  const eligibleStats = db
    .prepare(
      `SELECT 
        count(*) as total,
        sum(CASE WHEN overall_status = 'MIGRATED' THEN 1 ELSE 0 END) as migrated_count,
        sum(CASE WHEN overall_status = 'MIGRATING' THEN 1 ELSE 0 END) as migrating_count,
        sum(CASE WHEN overall_status = 'READY' THEN 1 ELSE 0 END) as ready_count,
        sum(CASE WHEN overall_status = 'FAILED' THEN 1 ELSE 0 END) as failed_count
       FROM mappings 
       WHERE project_id = ? AND credential_status != 'PURGED'`
    )
    .get(projectId) as {
      total: number;
      migrated_count: number;
      migrating_count: number;
      ready_count: number;
      failed_count: number;
    } | undefined;

  // Aggregate job metrics
  const jobTotals = db
    .prepare(
      `SELECT 
        coalesce(sum(messages_migrated), 0) as total_messages,
        coalesce(sum(bytes_transferred), 0) as total_bytes
       FROM migration_jobs 
       WHERE project_id = ?`
    )
    .get(projectId) as { total_messages: number; total_bytes: number } | undefined;

  // Recent completed jobs
  const recentCompletedRows = db
    .prepare(
      `SELECT j.mapping_id, m.source_email, m.target_email, j.messages_migrated, j.bytes_transferred, j.finished_at
       FROM migration_jobs j
       JOIN mappings m ON j.mapping_id = m.id
       WHERE j.project_id = ? AND j.status = 'COMPLETED'
       ORDER BY j.finished_at DESC
       LIMIT 10`
    )
    .all(projectId) as Array<{
      mapping_id: string;
      source_email: string;
      target_email: string;
      messages_migrated: number;
      bytes_transferred: number;
      finished_at: string;
    }>;

  // Active in-flight worker details
  const activeWorkers: ActiveWorkerInfo[] = [];

  const activeDbMappings = db
    .prepare(
      `SELECT m.id, m.source_email, m.target_email, j.id as job_id, j.messages_migrated, j.messages_total, j.bytes_transferred
       FROM mappings m
       JOIN migration_jobs j ON j.id = (
         SELECT j2.id FROM migration_jobs j2 
         WHERE j2.mapping_id = m.id AND j2.status = 'RUNNING' 
         ORDER BY j2.updated_at DESC, j2.created_at DESC LIMIT 1
       )
       WHERE m.project_id = ?`
    )
    .all(projectId) as Array<{
      id: string;
      source_email: string;
      target_email: string;
      job_id: string;
      messages_migrated: number;
      messages_total: number;
      bytes_transferred: number;
    }>;

  for (const row of activeDbMappings) {
    if (!activeMigrationJobs.has(row.job_id) && !queue.inFlightMappingIds.has(row.id)) {
      continue;
    }
    const liveState = liveTransferStates.get(row.id);
    activeWorkers.push({
      mappingId: row.id,
      sourceEmail: row.source_email,
      targetEmail: row.target_email,
      jobId: row.job_id,
      stage: liveState?.stage || "STREAMING",
      currentFolder: liveState?.currentFolder || "INBOX",
      currentUid: liveState?.currentUid || 0,
      currentSubject: liveState?.currentSubject || "Transferring messages...",
      migrated: liveState?.migrated || row.messages_migrated || 0,
      total: liveState?.total || row.messages_total || 1,
      bytesTransferred: liveState?.bytesTransferred || row.bytes_transferred || 0,
    });
  }

  const rawState = queue ? queue.state : "IDLE";
  const queueState =
    rawState === "PAUSED" || rawState === "STOPPED"
      ? rawState
      : activeWorkers.length > 0
      ? "RUNNING"
      : rawState;

  const isQueueRunning = queueState === "RUNNING";
  const isQueuePaused = queueState === "PAUSED";
  const hasActiveWorkers = activeWorkers.length > 0;

  return {
    projectId,
    state: queueState,
    isQueueRunning,
    isQueuePaused,
    hasActiveWorkers,
    concurrency: queue?.concurrency || 2,
    totalEligible: eligibleStats?.total || 0,
    completedCount: eligibleStats?.migrated_count || 0,
    inFlightCount: activeWorkers.length,
    pendingCount: queue ? queue.queuedMappingIds.length : (eligibleStats?.ready_count || 0),
    failedCount: queue ? queue.failedMappingIds.size : (eligibleStats?.failed_count || 0),
    totalMessagesMigrated: jobTotals?.total_messages || 0,
    totalBytesTransferred: jobTotals?.total_bytes || 0,
    activeWorkers,
    recentCompleted: recentCompletedRows.map((r) => ({
      mappingId: r.mapping_id,
      sourceEmail: r.source_email,
      targetEmail: r.target_email,
      messagesMigrated: r.messages_migrated,
      bytesTransferred: r.bytes_transferred,
      finishedAt: r.finished_at || "",
    })),
    startedAt: queue?.startedAt || null,
    updatedAt: new Date().toISOString(),
  };
}
