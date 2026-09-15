import { NextResponse } from "next/server";
import { updateMappingRow } from "@/lib/services/importService";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; mappingId: string }> }
) {
  const { id: projectId, mappingId } = await params;

  try {
    const body = await req.json();
    const { source_email, target_email, source_password } = body;

    const updated = updateMappingRow(projectId, mappingId, {
      source_email,
      target_email,
      source_password,
    });

    return NextResponse.json(
      {
        success: true,
        mapping: updated,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to update mapping" },
      { status: 400 }
    );
  }
}
