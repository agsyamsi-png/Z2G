"use client";

import { CheckCircle, AlertTriangle, ArrowRight, ShieldCheck, RefreshCw } from "lucide-react";

interface ImportSummaryStepProps {
  summary: {
    totalRecords: number;
    csvValidRecords: number;
    recordsRequiringAttention: number;
    duplicateMappingsCount: number;
    invalidEmailCount: number;
    missingCredentialCount: number;
    safePreviews: any[];
  };
  result: {
    added: number;
    updated: number;
    failed: number;
  };
  onProceedToMailboxes: () => void;
  onReupload: () => void;
}

export default function ImportSummaryStep({
  summary,
  result,
  onProceedToMailboxes,
  onReupload,
}: ImportSummaryStepProps) {
  return (
    <div className="space-y-6 max-w-3xl mx-auto py-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-white tracking-tight">Import Summary</h2>
        <p className="text-sm text-slate-400">
          CSV structure parsed and credentials securely encrypted into SQLite storage.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Records
          </span>
          <span className="text-2xl font-bold text-white mt-1 block">
            {summary.totalRecords}
          </span>
        </div>

        <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-2xl">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
            CSV-Valid
          </span>
          <span className="text-2xl font-bold text-emerald-400 mt-1 block">
            {summary.csvValidRecords}
          </span>
        </div>

        <div className="p-4 bg-amber-950/20 border border-amber-900/40 rounded-2xl">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
            Attention Needed
          </span>
          <span className="text-2xl font-bold text-amber-400 mt-1 block">
            {summary.recordsRequiringAttention}
          </span>
        </div>

        <div className="p-4 bg-blue-950/20 border border-blue-900/40 rounded-2xl">
          <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider block">
            Imported / Updated
          </span>
          <span className="text-2xl font-bold text-blue-400 mt-1 block">
            {result.added + result.updated}
          </span>
        </div>
      </div>

      {/* Distinction Alert */}
      <div className="p-4 bg-blue-950/40 border border-blue-800/80 rounded-2xl text-xs text-blue-200 space-y-1.5 shadow-lg">
        <div className="flex items-center space-x-2 font-semibold text-blue-300">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span>Important Security & Validation Note</span>
        </div>
        <p className="text-slate-300">
          <strong>CSV Valid</strong> confirms file structure, email syntax, and credential presence only. It does <em>not</em> imply credentials have been verified against Zoho or Google Workspace. Credential validation is performed asynchronously next.
        </p>
      </div>

      {/* Breakdown if issues exist */}
      {summary.recordsRequiringAttention > 0 && (
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <span className="text-xs font-semibold text-slate-300 block">Issues Detected:</span>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-500 block">Duplicates:</span>
              <span className="font-semibold text-slate-200">{summary.duplicateMappingsCount}</span>
            </div>
            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-500 block">Syntax Errors:</span>
              <span className="font-semibold text-slate-200">{summary.invalidEmailCount}</span>
            </div>
            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-500 block">Missing Passwords:</span>
              <span className="font-semibold text-slate-200">{summary.missingCredentialCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4">
        <button
          onClick={onReupload}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 text-xs font-medium transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Upload Another CSV</span>
        </button>

        <button
          onClick={onProceedToMailboxes}
          className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-medium transition shadow-lg shadow-blue-600/20 cursor-pointer"
        >
          <span>Proceed to Mailbox Validation</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
