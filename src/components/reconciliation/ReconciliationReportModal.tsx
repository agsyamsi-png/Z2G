"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, ShieldAlert, FileText, Check, Lock } from "lucide-react";
import { ProjectReconciliationSummary } from "@/lib/reconciliation/reconciliationEngine";

interface ReconciliationReportModalProps {
  projectId: string;
  onClose: () => void;
  onSignOffComplete: () => void;
}

export default function ReconciliationReportModal({
  projectId,
  onClose,
  onSignOffComplete,
}: ReconciliationReportModalProps) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ProjectReconciliationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operatorName, setOperatorName] = useState("Migration Lead");
  const [exceptionNotes, setExceptionNotes] = useState("");
  const [signingOff, setSigningOff] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reconcile`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to calculate reconciliation report");
      }
      const data = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const handleSignOff = async () => {
    if (!report) return;

    if (report.requiresException && !exceptionNotes.trim()) {
      setError("Documented exception rationale is required for sign-off when discrepancy is between 1.0% and 2.0%");
      return;
    }

    setSigningOff(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/sign-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorName,
          acceptedExceptions: exceptionNotes.trim() ? [exceptionNotes] : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Sign-off failed");
      }

      onSignOffComplete();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSigningOff(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-teal-950 text-teal-400 border border-teal-800/60">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Reconciliation & Sign-Off Matrix</h3>
              <p className="text-xs text-slate-400">
                Independent source vs destination discrepancy verification (Codex Section 8)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs cursor-pointer">
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs space-y-2">
            <div className="w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent animate-spin mx-auto" />
            <p>Evaluating message ledger and calculating discrepancy metrics...</p>
          </div>
        ) : report ? (
          <div className="space-y-5">
            {/* Formula Card */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs space-y-2">
              <span className="font-semibold text-slate-300 block">Reconciliation Formula:</span>
              <div className="p-2.5 bg-slate-900 rounded-xl font-mono text-[11px] text-teal-300 border border-slate-800">
                discrepancy_percent = 100 × (Total Unresolved U) / (Total Source Messages S)
              </div>
              <p className="text-slate-400 text-[11px]">
                Target: <strong>≤ 1.0%</strong> automatic pass · <strong>1.0%–2.0%</strong> exception sign-off required · <strong>&gt; 2.0%</strong> sign-off blocked.
              </p>
            </div>

            {/* High Level Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-slate-500 block">In-Scope Source (S)</span>
                <span className="text-xl font-bold text-white mt-0.5 block">{report.totalSourceCountS}</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-slate-500 block">Unresolved (U)</span>
                <span className="text-xl font-bold text-slate-200 mt-0.5 block">{report.totalUnresolvedCountU}</span>
              </div>
              <div
                className={`p-3 border rounded-xl ${
                  report.projectDiscrepancyPercent <= 1.0
                    ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-400"
                    : report.projectDiscrepancyPercent <= 2.0
                    ? "bg-amber-950/30 border-amber-800/60 text-amber-400"
                    : "bg-red-950/30 border-red-800/60 text-red-400"
                }`}
              >
                <span className="block text-[11px] font-semibold uppercase tracking-wider">Discrepancy %</span>
                <span className="text-xl font-bold mt-0.5 block">
                  {report.projectDiscrepancyPercent.toFixed(2)}%
                </span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-slate-500 block">Duplicates / Corrupted</span>
                <span className="text-xl font-bold text-slate-200 mt-0.5 block">
                  {report.totalDuplicates} / {report.totalCorrupted}
                </span>
              </div>
            </div>

            {/* Per-Mailbox Table */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
              <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Mailbox Reconciliation Breakdown
              </div>
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/50 text-[10px] uppercase text-slate-500 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Mailbox</th>
                      <th className="p-2.5 text-right">Source (S)</th>
                      <th className="p-2.5 text-right">Migrated</th>
                      <th className="p-2.5 text-right">Unresolved (U)</th>
                      <th className="p-2.5 text-right">Discrepancy</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {report.mailboxes.map((mb) => (
                      <tr key={mb.mappingId} className="hover:bg-slate-900/40">
                        <td className="p-2.5 font-medium text-white truncate max-w-xs">{mb.sourceEmail}</td>
                        <td className="p-2.5 text-right">{mb.sourceCountS}</td>
                        <td className="p-2.5 text-right text-emerald-400">{mb.migratedCount}</td>
                        <td className="p-2.5 text-right">{mb.unresolvedCountU}</td>
                        <td className="p-2.5 text-right font-semibold">{mb.discrepancyPercent}%</td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${
                              mb.status === "PASSED"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                                : mb.status === "EXCEPTION_REQUIRED"
                                ? "bg-amber-950 text-amber-400 border border-amber-800/50"
                                : "bg-red-950 text-red-400 border border-red-800/50"
                            }`}
                          >
                            {mb.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Exception input if required */}
            {report.requiresException && (
              <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded-xl space-y-2 text-xs">
                <div className="flex items-center space-x-2 text-amber-300 font-semibold">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Exception Justification Required (Discrepancy 1.0%–2.0%)</span>
                </div>
                <textarea
                  rows={2}
                  placeholder="Explain accepted discrepancy (e.g. non-deliverable spam exclusions, known corrupted legacy drafts)..."
                  value={exceptionNotes}
                  onChange={(e) => setExceptionNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            {/* Operator Signature & Sign Off */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 text-xs">
              <span className="font-semibold text-white block">Formal Sign-Off Gate</span>
              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
                  Lead Operator Signature / Name *
                </label>
                <input
                  type="text"
                  required
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full sm:w-80 px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-medium cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handleSignOff}
                disabled={signingOff || !report.isEligibleForSignOff || !operatorName.trim()}
                className="inline-flex items-center space-x-1.5 bg-teal-600 hover:bg-teal-500 text-white px-5 py-2.5 rounded-xl text-xs font-medium transition shadow-lg shadow-teal-600/20 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{signingOff ? "Signing Off..." : "Execute Formal Sign-Off"}</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
