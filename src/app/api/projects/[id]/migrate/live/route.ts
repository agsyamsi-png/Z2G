import { NextResponse } from "next/server";
import { getLiveMigrationFeed } from "@/lib/migration/migrationEngine";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { searchParams } = new URL(req.url);
  const mappingId = searchParams.get("mappingId");

  if (!mappingId) {
    return NextResponse.json(
      { error: "mappingId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const feed = getLiveMigrationFeed(projectId, mappingId);
    return NextResponse.json({
      success: true,
      ...feed,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to retrieve live migration feed" },
      { status: 500 }
    );
  }
}
