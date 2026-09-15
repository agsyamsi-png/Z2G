import { NextRequest, NextResponse } from "next/server";
import { getDatabase, MessageLedgerRow } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const mappingId = searchParams.get("mappingId");

    const db = getDatabase();

    let query = "SELECT * FROM message_ledger WHERE project_id = ?";
    const queryParams: unknown[] = [projectId];

    if (mappingId) {
      query += " AND mapping_id = ?";
      queryParams.push(mappingId);
    }

    query += " ORDER BY created_at DESC LIMIT 200";

    const ledger = db.prepare(query).all(...queryParams) as MessageLedgerRow[];

    return NextResponse.json(ledger);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to load message ledger" },
      { status: 500 }
    );
  }
}
