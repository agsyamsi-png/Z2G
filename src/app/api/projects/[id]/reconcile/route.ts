import { NextResponse } from "next/server";
import { generateReconciliationReport } from "@/lib/reconciliation/reconciliationEngine";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const report = generateReconciliationReport(projectId);
    return NextResponse.json(report);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to generate reconciliation report" },
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
    const report = generateReconciliationReport(projectId);
    return NextResponse.json(report);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to generate reconciliation report" },
      { status: 500 }
    );
  }
}
