"use client";

import { useState, useEffect } from "react";
import { Database, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, Search } from "lucide-react";
import { MessageLedgerRow } from "@/lib/db";

interface LedgerExplorerProps {
  projectId: string;
}

export default function LedgerExplorer({ projectId }: LedgerExplorerProps) {
  const [ledger, setLedger] = useState<MessageLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ledger`);
      if (res.ok) {
        const data = await res.json();
        setLedger(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [projectId]);

  const filtered = ledger.filter(
    (item) =>
      item.source_folder.toLowerCase().includes(search.toLowerCase()) ||
      item.rfc822_hash.toLowerCase().includes(search.toLowerCase()) ||
      item.transfer_status.toLowerCase().includes(search.toLowerCase()) ||
      (item.target_message_id && item.target_message_id.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <span>Cryptographic Message Ledger & Deduplication Proofs</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Pre-write SHA-256 RFC822 hash ledger guaranteeing zero target mailbox duplicates on re-sync.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by folder, hash, status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 w-64"
            />
          </div>
          <button
            onClick={fetchLedger}
            disabled={loading}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 text-xs">Loading ledger entries...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-xs">
          No transferred messages recorded in the ledger yet. Run migration jobs to populate.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/40">
                <th className="py-2.5 px-3">Folder / UID</th>
                <th className="py-2.5 px-3">SHA-256 RFC822 Hash</th>
                <th className="py-2.5 px-3">Target Google ID</th>
                <th className="py-2.5 px-3">Size</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Recorded At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-2 px-3 font-medium text-white">
                    <span>{row.source_folder}</span>
                    <span className="ml-1 text-[10px] text-slate-500 font-mono">#UID-{row.source_uid}</span>
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-cyan-400/90 truncate max-w-xs">
                    {row.rfc822_hash}
                  </td>
                  <td className="py-2 px-3 text-slate-400 font-mono text-[11px] truncate max-w-xs">
                    {row.target_message_id || "—"}
                  </td>
                  <td className="py-2 px-3 text-slate-400 text-[11px]">
                    {row.size_bytes ? `${(row.size_bytes / 1024).toFixed(1)} KB` : "—"}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        row.transfer_status === "VERIFIED"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : row.transfer_status === "SKIPPED"
                          ? "bg-slate-800 text-slate-400"
                          : "bg-red-950 text-red-400 border border-red-800"
                      }`}
                    >
                      {row.transfer_status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-[10px] text-slate-500 font-mono">
                    {new Date(row.created_at).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
