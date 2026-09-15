"use client";

import { useState, useEffect } from "react";
import { Compass, CheckCircle2, AlertTriangle, Folder, HardDrive, Calendar } from "lucide-react";
import { MappingRow, DiscoveryBaselineRow } from "@/lib/db";
import { formatBytes, formatNumber } from "@/lib/utils/format";

interface BaselineReviewModalProps {
  projectId: string;
  mapping: MappingRow;
  onClose: () => void;
  onBaselineReviewed: () => void;
}

export default function BaselineReviewModal({
  projectId,
  mapping,
  onClose,
  onBaselineReviewed,
}: BaselineReviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [baseline, setBaseline] = useState<DiscoveryBaselineRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [operatorName, setOperatorName] = useState("Migration Operator");

  const runDiscovery = async () => {
    setDiscovering(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappingId: mapping.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Mailbox discovery failed");
      }

      const data = await res.json();
      setBaseline(data.baseline);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setDiscovering(false);
    }
  };

  useEffect(() => {
    runDiscovery();
  }, []);

  const handleAcceptBaseline = async () => {
    setReviewing(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/baseline/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappingId: mapping.id, operator: operatorName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to review baseline");
      }

      onBaselineReviewed();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setReviewing(false);
    }
  };

  const folders = baseline ? JSON.parse(baseline.folder_inventory_json || "[]") : [];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800/60">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Discovery Baseline Review</h3>
              <p className="text-xs text-slate-400">
                {mapping.source_email} → {mapping.target_email}
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

        {discovering ? (
          <div className="py-12 text-center text-slate-400 text-xs space-y-2">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto" />
            <p>Scanning Zoho IMAP mailbox folder structure and message counts...</p>
          </div>
        ) : baseline ? (
          <div className="space-y-4">
            {/* High Level Stats */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center space-x-3">
                <Folder className="w-5 h-5 text-indigo-400" />
                <div>
                  <span className="text-slate-500 block">Total Messages</span>
                  <span className="text-base font-bold text-white">{formatNumber(baseline.total_messages)}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center space-x-3">
                <HardDrive className="w-5 h-5 text-blue-400" />
                <div>
                  <span className="text-slate-500 block">Mailbox Scope Size</span>
                  <span className="text-base font-bold text-white">
                    {formatBytes(baseline.total_size_bytes)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-emerald-400" />
                <div>
                  <span className="text-slate-500 block">Date Boundaries</span>
                  <span className="text-[11px] font-medium text-slate-300 block truncate">
                    {baseline.earliest_date?.split("T")[0] || "N/A"} to{" "}
                    {baseline.latest_date?.split("T")[0] || "N/A"}
                  </span>
                </div>
              </div>
            </div>

            {/* Folder Table */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
              <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Discovered Folder Inventory ({folders.length})</span>
                <span className="text-slate-500 font-normal">Scope S: {formatBytes(baseline.total_size_bytes)}</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/50 text-[10px] uppercase text-slate-500 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Folder Name</th>
                      <th className="p-2.5 text-right">Messages</th>
                      <th className="p-2.5 text-right">Size</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {folders.map((f: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-900/40">
                        <td className="p-2.5 font-medium text-white">{f.name}</td>
                        <td className="p-2.5 text-right">{formatNumber(f.messageCount)}</td>
                        <td className="p-2.5 text-right font-mono text-slate-400">{formatBytes(f.sizeBytes)}</td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${
                              f.included
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {f.included ? "Included" : "Skipped"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Operator Review Info */}
            <div className="p-3.5 bg-indigo-950/30 border border-indigo-900/40 rounded-xl text-xs text-indigo-300 space-y-2">
              <span className="font-semibold block">Baseline Review Acceptance Gate</span>
              <p className="text-slate-400 text-[11px]">
                Locking this baseline revision establishes the immutable scope ($S$) for initial migration and reconciliation.
              </p>
              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
                  Operator Signature / Name
                </label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs w-full sm:w-64 focus:outline-none focus:border-indigo-500"
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
                onClick={handleAcceptBaseline}
                disabled={reviewing || !operatorName.trim()}
                className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-medium transition shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{reviewing ? "Accepting..." : "Lock & Review Baseline"}</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
