import { NextResponse } from "next/server";
import { reviewAndAcceptBaseline } from "@/lib/discovery/discoveryEngine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const body = await req.json();
    const { mappingId, mappingIds, operator } = body;
    const operatorName = operator || "operator";

    if (mappingId) {
      const reviewed = reviewAndAcceptBaseline(projectId, mappingId, operatorName);
      return NextResponse.json({ success: true, baseline: reviewed });
    }

    if (mappingIds && Array.isArray(mappingIds)) {
      const reviewedBaselines = mappingIds.map((mId: string) =>
        reviewAndAcceptBaseline(projectId, mId, operatorName)
      );
      return NextResponse.json({ success: true, count: reviewedBaselines.length });
    }

    return NextResponse.json({ error: "mappingId or mappingIds required" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Baseline review failed" },
      { status: 400 }
    );
  }
}
