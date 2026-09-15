import { NextResponse } from "next/server";
import {
  validateProjectMappings,
  getProjectValidationProgress,
} from "@/lib/queue/validationWorker";
import { bulkDiscoverProject } from "@/lib/discovery/discoveryEngine";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const progress = getProjectValidationProgress(projectId);

  return NextResponse.json(progress || { projectId, isRunning: false, completed: 0, total: 0 });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { mappingIds, concurrency, autoDiscover, autoAccept } = body;

    const progress = await validateProjectMappings(
      projectId,
      mappingIds,
      concurrency || 5
    );

    if (autoDiscover) {
      await bulkDiscoverProject(
        projectId,
        mappingIds,
        autoAccept ?? true,
        "System Auto-Discovery Pipeline",
        concurrency || 5
      );
    }

    return NextResponse.json(progress, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Validation failed" },
      { status: 500 }
    );
  }
}
