import { NextResponse } from "next/server";
import { getDatabase, ProjectRow, MappingRow, DiscoveryBaselineRow, MigrationJobRow } from "@/lib/db";
import { getZohoStorageForEmail } from "@/lib/providers/zohoAdminStorage";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const db = getDatabase();

  const project = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(projectId) as ProjectRow | undefined;

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const mappings = db
    .prepare("SELECT * FROM mappings WHERE project_id = ? ORDER BY created_at ASC")
    .all(projectId) as MappingRow[];

  const baselines = db
    .prepare("SELECT * FROM discovery_baselines WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId) as DiscoveryBaselineRow[];

  const jobs = db
    .prepare("SELECT * FROM migration_jobs WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId) as MigrationJobRow[];

  const signOff = db
    .prepare("SELECT * FROM sign_offs WHERE project_id = ? ORDER BY signed_off_at DESC LIMIT 1")
    .get(projectId);

  const report = db
    .prepare("SELECT * FROM reconciliation_reports WHERE project_id = ? ORDER BY report_revision DESC LIMIT 1")
    .get(projectId);

  const baselineMap = new Map<string, DiscoveryBaselineRow>();
  for (const b of baselines) {
    if (!baselineMap.has(b.mapping_id)) {
      baselineMap.set(b.mapping_id, b);
    }
  }

  const enrichedMappings = mappings.map((m) => {
    const b = baselineMap.get(m.id);
    const zohoStorage = getZohoStorageForEmail(m.source_email);
    return {
      ...m,
      baseline_summary: b
        ? {
            total_messages: b.total_messages,
            total_size_bytes: b.total_size_bytes,
            reviewed_at: b.reviewed_at,
          }
        : null,
      zoho_storage: zohoStorage
        ? {
            allottedGb: zohoStorage.allottedGb,
            usedGb: zohoStorage.usedGb,
            usedPercent: zohoStorage.usedPercent,
            usedSizeBytes: zohoStorage.usedSizeBytes,
            estimatedMessages: zohoStorage.estimatedMessages,
          }
        : null,
    };
  });

  // Exclude ciphertext and private keys from the API output
  const safeProject = {
    id: project.id,
    name: project.name,
    zoho_host: project.zoho_host,
    zoho_port: project.zoho_port,
    status: project.status,
    has_service_account: !!project.google_service_account_json,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };

  return NextResponse.json(
    {
      project: safeProject,
      mappings: enrichedMappings,
      baselines,
      jobs,
      signOff,
      report,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const db = getDatabase();

  try {
    const body = await req.json();
    const { name, zoho_host, zoho_port, google_service_account_json } = body;

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name.trim());
    }
    if (zoho_host !== undefined) {
      updates.push("zoho_host = ?");
      values.push(zoho_host.trim());
    }
    if (zoho_port !== undefined) {
      updates.push("zoho_port = ?");
      values.push(Number(zoho_port));
    }
    if (google_service_account_json !== undefined) {
      updates.push("google_service_account_json = ?");
      values.push(google_service_account_json ? google_service_account_json.trim() : null);
    }

    const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (updates.length > 0) {
      updates.push("updated_at = ?");
      values.push(new Date().toISOString());
      values.push(projectId);

      db.prepare(`UPDATE projects SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
    if (!updated) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      project: {
        id: updated.id,
        name: updated.name,
        zoho_host: updated.zoho_host,
        zoho_port: updated.zoho_port,
        status: updated.status,
        has_service_account: !!updated.google_service_account_json,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to update project" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const db = getDatabase();

  db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

  return NextResponse.json({ success: true, message: "Project deleted" });
}
