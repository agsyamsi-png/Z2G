"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft } from "lucide-react";
import { ColumnMapping } from "@/lib/csv/parser";

interface ColumnMappingStepProps {
  projectId: string;
  rawCsv: string;
  detection: {
    headersDetected: boolean;
    autoMapping: ColumnMapping | null;
    columns: string[];
    ambiguous: boolean;
  };
  hasHeaderRow: boolean;
  onCommitSuccess: (summary: any, result: any) => void;
  onBack: () => void;
}

export default function ColumnMappingStep({
  projectId,
  rawCsv,
  detection,
  hasHeaderRow: initialHasHeader,
  onCommitSuccess,
  onBack,
}: ColumnMappingStepProps) {
  const [sourceEmailIdx, setSourceEmailIdx] = useState<number>(
    detection.autoMapping?.source_email_index ?? 0
  );
  const [sourcePasswordIdx, setSourcePasswordIdx] = useState<number>(
    detection.autoMapping?.source_password_index ?? 1
  );
  const [targetEmailIdx, setTargetEmailIdx] = useState<number>(
    detection.autoMapping?.target_email_index ?? 2
  );
  const [hasHeader, setHasHeader] = useState<boolean>(initialHasHeader);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const columns = detection.columns;

  const isDistinctMapping =
    sourceEmailIdx !== sourcePasswordIdx &&
    sourceEmailIdx !== targetEmailIdx &&
    sourcePasswordIdx !== targetEmailIdx;

  const handleCommit = async () => {
    if (!isDistinctMapping) {
      setError("Each required field must map to a unique distinct column");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const mapping: ColumnMapping = {
        source_email_index: sourceEmailIdx,
        source_password_index: sourcePasswordIdx,
        target_email_index: targetEmailIdx,
      };

      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvContent: rawCsv,
          action: "commit",
          mapping,
          hasHeaderRow: hasHeader,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to commit CSV import");
      }

      const data = await res.json();
      onCommitSuccess(data.summary, data.result);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto py-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-white tracking-tight">Review Column Mapping</h2>
        <p className="text-sm text-slate-400">
          Verify that input columns correspond correctly to canonical migration fields.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {detection.headersDetected ? (
        <div className="p-4 bg-emerald-950/30 border border-emerald-800/60 rounded-xl flex items-center space-x-2.5 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>Standard migration headers recognized automatically.</span>
        </div>
      ) : (
        <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded-xl flex items-center space-x-2.5 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Headers were ambiguous or custom. Please confirm column mapping below.</span>
        </div>
      )}

      {/* Mapping Selectors */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Canonical Field
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            CSV Input Column
          </span>
        </div>

        {/* Source Email */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-sm font-semibold text-slate-200">Source Email (Zoho) *</span>
            <span className="text-xs text-slate-500 block">Zoho source mailbox address</span>
          </div>
          <select
            value={sourceEmailIdx}
            onChange={(e) => setSourceEmailIdx(Number(e.target.value))}
            className="px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-blue-500"
          >
            {columns.map((col, idx) => (
              <option key={idx} value={idx}>
                {col} (Index {idx})
              </option>
            ))}
          </select>
        </div>

        {/* Source Password */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-sm font-semibold text-slate-200">Source Credential (Password) *</span>
            <span className="text-xs text-slate-500 block">Encrypted immediately on ingest</span>
          </div>
          <select
            value={sourcePasswordIdx}
            onChange={(e) => setSourcePasswordIdx(Number(e.target.value))}
            className="px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-blue-500"
          >
            {columns.map((col, idx) => (
              <option key={idx} value={idx}>
                {col} (Index {idx})
              </option>
            ))}
          </select>
        </div>

        {/* Target Email */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-sm font-semibold text-slate-200">Target Email (Google Workspace) *</span>
            <span className="text-xs text-slate-500 block">Destination Google mailbox</span>
          </div>
          <select
            value={targetEmailIdx}
            onChange={(e) => setTargetEmailIdx(Number(e.target.value))}
            className="px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-blue-500"
          >
            {columns.map((col, idx) => (
              <option key={idx} value={idx}>
                {col} (Index {idx})
              </option>
            ))}
          </select>
        </div>

        {/* Header confirmation checkbox */}
        <div className="pt-4 border-t border-slate-800 flex items-center space-x-2">
          <input
            type="checkbox"
            id="hasHeaderCheckbox"
            checked={hasHeader}
            onChange={(e) => setHasHeader(e.target.checked)}
            className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="hasHeaderCheckbox" className="text-xs text-slate-300 cursor-pointer">
            First row is a header row (skip row 1 during data ingestion)
          </label>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 text-xs font-medium transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Upload Another File</span>
        </button>

        <button
          onClick={handleCommit}
          disabled={!isDistinctMapping || submitting}
          className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-medium transition disabled:opacity-50 shadow-lg shadow-blue-600/20 cursor-pointer"
        >
          <span>{submitting ? "Encrypting & Importing..." : "Confirm & Import Mappings"}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
