import { NextResponse } from "next/server";
import { purgeProjectCredentials } from "@/lib/security/purgeEngine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const body = await req.json();
    const { operatorName, mappingIds } = body;

    if (!operatorName) {
      return NextResponse.json(
        { error: "Operator authorization name required for credential purge" },
        { status: 400 }
      );
    }

    const result = purgeProjectCredentials(projectId, operatorName, mappingIds);

    return NextResponse.json(
      {
        success: true,
        result,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Credential purge failed" },
      { status: 500 }
    );
  }
}
