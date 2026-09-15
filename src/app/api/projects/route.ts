import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDatabase, ProjectRow } from "@/lib/db";
import { DEFAULT_GOOGLE_SERVICE_ACCOUNT_JSON } from "@/lib/providers/google";

export async function GET() {
  const db = getDatabase();
  const projects = db
    .prepare("SELECT * FROM projects ORDER BY created_at DESC")
    .all() as ProjectRow[];

  // Return project list without sensitive service account private keys
  const safeProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    zoho_host: p.zoho_host,
    zoho_port: p.zoho_port,
    status: p.status,
    has_service_account: !!p.google_service_account_json,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));

  return NextResponse.json(safeProjects);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, zoho_host, zoho_port, google_service_account_json } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    const db = getDatabase();
    const id = `proj-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO projects (
        id, name, zoho_host, zoho_port, google_service_account_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
    ).run(
      id,
      name.trim(),
      zoho_host?.trim() || "imappro.zoho.com",
      zoho_port || 993,
      google_service_account_json?.trim() || DEFAULT_GOOGLE_SERVICE_ACCOUNT_JSON,
      now,
      now
    );

    return NextResponse.json({
      id,
      name,
      zoho_host: zoho_host || "imappro.zoho.com",
      zoho_port: zoho_port || 993,
      status: "ACTIVE",
      created_at: now,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to create project" },
      { status: 500 }
    );
  }
}
