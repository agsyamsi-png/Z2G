import { NextResponse } from "next/server";
import {
  runProjectDiagnostics,
  applyRemediationAction,
} from "@/lib/remediation/remediationEngine";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const report = await runProjectDiagnostics(projectId);
    return NextResponse.json(report, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to run diagnostics" },
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
    const body = await req.json().catch(() => ({}));
    const { action, payload } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Remediation action is required" },
        { status: 400 }
      );
    }

    const result = await applyRemediationAction(projectId, action, payload);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to apply remediation action" },
      { status: 500 }
    );
  }
}
