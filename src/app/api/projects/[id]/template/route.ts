import { NextResponse } from "next/server";
import { generateMigrationMapTemplate } from "@/lib/csv/template";

export async function GET() {
  const templateCsv = generateMigrationMapTemplate();

  return new NextResponse(templateCsv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="migration-map-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
