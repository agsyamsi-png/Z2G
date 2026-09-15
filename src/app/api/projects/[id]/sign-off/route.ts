import { NextResponse } from "next/server";
import { executeProjectSignOff } from "@/lib/reconciliation/reconciliationEngine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const body = await req.json();
    const { operatorName, acceptedExceptions, isSubset, includedMappingIds } = body;

    if (!operatorName) {
      return NextResponse.json({ error: "Operator name is required for formal sign-off" }, { status: 400 });
    }

    const signOff = executeProjectSignOff(projectId, operatorName, {
      acceptedExceptions,
      isSubset,
      includedMappingIds,
    });

    return NextResponse.json({ success: true, signOff });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Sign-off execution failed" },
      { status: 400 }
    );
  }
}
