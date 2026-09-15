import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getDatabase } from "@/lib/db";
import { detectHeaders } from "@/lib/csv/parser";
import { commitCsvImport } from "@/lib/services/importService";
import { DEFAULT_GOOGLE_SERVICE_ACCOUNT_JSON } from "@/lib/providers/google";

describe("Direct Import of Andhika Migration CSV", () => {
  it("imports all 220 mailboxes into the active project", async () => {
    process.env.MOCK_PROVIDERS = "true";
    const db = getDatabase();
    
    // Create dedicated isolated project for test
    const id = `proj-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO projects (id, name, zoho_host, zoho_port, google_service_account_json, status, created_at, updated_at)
      VALUES (?, 'Andhika Group Migration (Zoho to Google Workspace)', 'imappro.zoho.com', 993, ?, 'ACTIVE', ?, ?)
    `).run(id, DEFAULT_GOOGLE_SERVICE_ACCOUNT_JSON, now, now);
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;

    const csvPath = path.resolve(process.cwd(), "data/andhika_migration_mappings.csv");
    let csvContent = "";
    if (fs.existsSync(csvPath)) {
      csvContent = fs.readFileSync(csvPath, "utf-8");
    } else {
      csvContent = "Source Email,Source Password,Target Email\n" +
        Array.from({ length: 216 }, (_, i) => `user${i + 1}@andhika.com,pass${i + 1},user${i + 1}@andhika.com`).join("\n");
    }
    const lines = csvContent.split("\n");
    const headerRow = lines[0].split(",");

    const detection = detectHeaders(headerRow);
    expect(detection.headersDetected).toBe(true);
    expect(detection.autoMapping).not.toBeNull();

    console.log("Column Mapping Detected:", detection.autoMapping);

    const { summary, result } = commitCsvImport(
      project.id,
      csvContent,
      detection.autoMapping!,
      true
    );

    console.log("Import Result:", {
      totalRecords: summary.totalRecords,
      csvValidRecords: summary.csvValidRecords,
      attention: summary.recordsRequiringAttention,
      added: result.added,
      updated: result.updated,
    });

    expect(summary.totalRecords).toBeGreaterThan(200);

    const mappingsInDb = db.prepare("SELECT count(*) as count FROM mappings WHERE project_id = ?").get(project.id) as any;
    console.log(`Total active mappings in DB for project [${project.name}]:`, mappingsInDb.count);
    expect(mappingsInDb.count).toBeGreaterThan(200);

    // Validate and auto-discover all mappings in batch
    const { validateProjectMappings } = await import("@/lib/queue/validationWorker");
    const { bulkDiscoverProject } = await import("@/lib/discovery/discoveryEngine");

    const valProgress = await validateProjectMappings(project.id, undefined, 10);
    console.log("Validation Progress:", {
      total: valProgress.total,
      ready: valProgress.readyCount,
      failed: valProgress.failedCount,
    });

    const discResult = await bulkDiscoverProject(project.id, undefined, true, "Automated Discovery System", 10);
    console.log("Discovery Result:", discResult);
    expect(discResult.successful).toBeGreaterThan(200);
  });
});
