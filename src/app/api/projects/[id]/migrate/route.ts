import { NextResponse } from "next/server";
import { executeMigrationJob, cancelMigrationJob } from "@/lib/migration/migrationEngine";
import { executeDeltaSync } from "@/lib/migration/deltaEngine";
import { getDatabase } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const body = await req.json();
    const { mappingId, mappingIds, jobType, async: runAsync, action } = body;
    const type = jobType === "DELTA" ? "DELTA" : "INITIAL";

    if (action === "cancel" && mappingId) {
      const db = getDatabase();
      const activeJob = db
        .prepare("SELECT id FROM migration_jobs WHERE mapping_id = ? AND status = 'RUNNING'")
        .get(mappingId) as { id: string } | undefined;

      if (activeJob) {
        cancelMigrationJob(activeJob.id);
        return NextResponse.json({ success: true, cancelled: true, jobId: activeJob.id });
      }
      return NextResponse.json({ success: true, message: "No active running job found" });
    }

    if (mappingId) {
      const db = getDatabase();
      const existingRunningJob = db
        .prepare("SELECT id FROM migration_jobs WHERE mapping_id = ? AND status = 'RUNNING'")
        .get(mappingId) as { id: string } | undefined;

      if (existingRunningJob) {
        return NextResponse.json({
          success: true,
          started: false,
          alreadyRunning: true,
          jobId: existingRunningJob.id,
          mappingId,
          jobType: type,
        });
      }

      if (runAsync) {
        // Trigger job asynchronously in background
        const executionPromise =
          type === "DELTA"
            ? executeDeltaSync(projectId, mappingId)
            : executeMigrationJob(projectId, mappingId, "INITIAL");

        executionPromise.catch((err) => {
          console.error(`[MIGRATION ASYNC ERROR] Mapping ${mappingId}:`, err);
        });

        return NextResponse.json({ success: true, started: true, mappingId, jobType: type });
      }

      const job =
        type === "DELTA"
          ? await executeDeltaSync(projectId, mappingId)
          : await executeMigrationJob(projectId, mappingId, "INITIAL");

      return NextResponse.json({ success: true, job });
    }

    if (mappingIds && Array.isArray(mappingIds)) {
      const results = [];
      for (const mId of mappingIds) {
        try {
          const job =
            type === "DELTA"
              ? await executeDeltaSync(projectId, mId)
              : await executeMigrationJob(projectId, mId, "INITIAL");
          results.push(job);
        } catch (err) {
          results.push({ mappingId: mId, error: (err as Error).message, status: "FAILED" });
        }
      }
      return NextResponse.json({ success: true, jobs: results });
    }

    return NextResponse.json({ error: "mappingId or mappingIds required" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Migration execution failed" },
      { status: 400 }
    );
  }
}
