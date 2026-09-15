import { NextResponse } from "next/server";
import Papa from "papaparse";
import { detectHeaders, parseAndValidateCsv, ColumnMapping } from "@/lib/csv/parser";
import { commitCsvImport } from "@/lib/services/importService";

const MAX_CSV_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit
const MAX_ROW_COUNT = 10000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const contentType = req.headers.get("content-type") || "";
    let csvContent = "";
    let action = "detect";
    let customMapping: ColumnMapping | null = null;
    let hasHeaderRow = true;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      csvContent = body.csvContent || "";
      action = body.action || "detect";
      customMapping = body.mapping || null;
      hasHeaderRow = body.hasHeaderRow !== false;
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No CSV file uploaded" }, { status: 400 });
      }
      if (file.size > MAX_CSV_SIZE_BYTES) {
        return NextResponse.json(
          { error: `File exceeds maximum allowed size of ${MAX_CSV_SIZE_BYTES / 1024 / 1024}MB` },
          { status: 400 }
        );
      }
      csvContent = await file.text();
      action = (formData.get("action") as string) || "detect";
      const mappingStr = formData.get("mapping") as string | null;
      if (mappingStr) {
        try {
          customMapping = JSON.parse(mappingStr);
        } catch {
          // ignore
        }
      }
    } else {
      csvContent = await req.text();
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return NextResponse.json({ error: "CSV content is empty" }, { status: 400 });
    }

    if (Buffer.byteLength(csvContent, "utf-8") > MAX_CSV_SIZE_BYTES) {
      return NextResponse.json({ error: "CSV exceeds 10MB limit" }, { status: 400 });
    }

    // Strip BOM for inspection
    let cleanCsv = csvContent;
    if (cleanCsv.charCodeAt(0) === 0xfeff) {
      cleanCsv = cleanCsv.slice(1);
    }

    // Parse first few rows in memory for detection
    const parsedSample = Papa.parse<string[]>(cleanCsv, {
      preview: 5,
      skipEmptyLines: "greedy",
    });

    if (parsedSample.data.length === 0) {
      return NextResponse.json({ error: "No records found in CSV" }, { status: 400 });
    }

    const firstRow = parsedSample.data[0];
    const detection = detectHeaders(firstRow);

    if (action === "detect") {
      let previewSummary = null;
      const mappingToUse = customMapping || detection.autoMapping;

      if (mappingToUse) {
        previewSummary = parseAndValidateCsv(cleanCsv, mappingToUse, hasHeaderRow);
        if (previewSummary.totalRecords > MAX_ROW_COUNT) {
          return NextResponse.json(
            { error: `CSV exceeds maximum limit of ${MAX_ROW_COUNT} rows` },
            { status: 400 }
          );
        }
      }

      return NextResponse.json(
        {
          detection,
          hasHeaderRow,
          safePreviewSummary: previewSummary
            ? {
                totalRecords: previewSummary.totalRecords,
                csvValidRecords: previewSummary.csvValidRecords,
                recordsRequiringAttention: previewSummary.recordsRequiringAttention,
                duplicateMappingsCount: previewSummary.duplicateMappingsCount,
                invalidEmailCount: previewSummary.invalidEmailCount,
                missingCredentialCount: previewSummary.missingCredentialCount,
                safePreviews: previewSummary.safePreviews.slice(0, 10), // Safe top 10 rows preview
              }
            : null,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    if (action === "commit") {
      const mappingToUse = customMapping || detection.autoMapping;
      if (!mappingToUse) {
        return NextResponse.json(
          { error: "Valid column mapping required before committing import" },
          { status: 400 }
        );
      }

      const { summary, result } = commitCsvImport(
        projectId,
        cleanCsv,
        mappingToUse,
        hasHeaderRow
      );

      return NextResponse.json(
        {
          success: true,
          summary: {
            totalRecords: summary.totalRecords,
            csvValidRecords: summary.csvValidRecords,
            recordsRequiringAttention: summary.recordsRequiringAttention,
            duplicateMappingsCount: summary.duplicateMappingsCount,
            invalidEmailCount: summary.invalidEmailCount,
            missingCredentialCount: summary.missingCredentialCount,
            safePreviews: summary.safePreviews.slice(0, 50),
          },
          result,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "CSV processing failed" },
      { status: 500 }
    );
  }
}
