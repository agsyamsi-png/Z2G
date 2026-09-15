import { NextResponse } from "next/server";
import {
  startBulkMigration,
  pauseBulkMigration,
  resumeBulkMigration,
  stopBulkMigration,
  setBulkMigrationConcurrency,
  getBulkMigrationStatus,
} from "@/lib/migration/bulkMigrationEngine";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const status = getBulkMigrationStatus(projectId);
    return NextResponse.json({ success: true, ...status });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to get bulk migration status" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const body = await req.json();
    const { action, concurrency, mappingIds } = body;

    let result;
    switch (action) {
      case "start":
        result = await startBulkMigration(projectId, { concurrency, mappingIds });
        break;
      case "pause":
        result = pauseBulkMigration(projectId);
        break;
      case "resume":
        result = resumeBulkMigration(projectId);
        break;
      case "stop":
        result = stopBulkMigration(projectId);
        break;
      case "set_concurrency":
        result = setBulkMigrationConcurrency(projectId, Number(concurrency) || 2);
        break;
      default:
        return NextResponse.json(
          { error: `Unknown bulk migration action: '${action}'. Expected 'start', 'pause', 'resume', 'stop', or 'set_concurrency'.` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Bulk migration action failed" },
      { status: 500 }
    );
  }
}
