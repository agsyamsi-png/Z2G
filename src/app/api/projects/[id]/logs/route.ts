import { NextRequest, NextResponse } from "next/server";
import { getDatabase, AuditLogRow } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const db = getDatabase();

    const logs = db
      .prepare("SELECT * FROM audit_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT 100")
      .all(projectId) as AuditLogRow[];

    return NextResponse.json(logs);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to load audit logs" },
      { status: 500 }
    );
  }
}
