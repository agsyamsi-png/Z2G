import { NextResponse } from "next/server";
import { bulkDiscoverProject, discoverMailbox } from "@/lib/discovery/discoveryEngine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { mappingId, mappingIds, autoAccept, operator, concurrency } = body;

    if (mappingId) {
      const baseline = await discoverMailbox(projectId, mappingId);
      return NextResponse.json({ success: true, baseline });
    }

    const result = await bulkDiscoverProject(
      projectId,
      mappingIds,
      autoAccept ?? true,
      operator || "Lead Operator",
      concurrency || 5
    );
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Discovery failed" },
      { status: 400 }
    );
  }
}
