"use client";

import { useState, useEffect } from "react";
import { Shield, RefreshCw, Filter, Clock, User, FileText, CheckCircle2 } from "lucide-react";
import { AuditLogRow } from "@/lib/db";

interface AuditLogsViewerProps {
  projectId: string;
}

export default function AuditLogsViewer({ projectId }: AuditLogsViewerProps) {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [projectId]);

  const filteredLogs = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.actor.toLowerCase().includes(search.toLowerCase()) ||
      (l.metadata_json && l.metadata_json.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <Shield className="w-4 h-4 text-purple-400" />
            <span>Cryptographic & Operational Audit Trail</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable log of operator actions, preflight checks, baseline reviews, and credential purges.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Search audit actions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 w-48"
          />
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 text-xs">Loading audit records...</div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-xs">No matching audit logs found.</div>
      ) : (
        <div className="divide-y divide-slate-800/60 max-h-96 overflow-y-auto">
          {filteredLogs.map((log) => (
            <div key={log.id} className="py-3 px-2 flex items-start justify-between text-xs hover:bg-slate-950/40 rounded-lg transition">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      log.action.includes("PURGE")
                        ? "bg-purple-950 text-purple-400 border border-purple-800"
                        : log.action.includes("SIGN_OFF")
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : log.action.includes("MIGRATE")
                        ? "bg-blue-950 text-blue-400 border border-blue-800"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {log.action}
                  </span>
                  <span className="text-slate-400 font-medium">{log.actor}</span>
                </div>

                {log.metadata_json && (
                  <div className="text-[11px] text-slate-400 font-mono bg-slate-950/70 p-1.5 rounded-md max-w-xl truncate">
                    {log.metadata_json}
                  </div>
                )}
              </div>

              <div className="text-right text-[10px] text-slate-500 flex items-center space-x-1 shrink-0 ml-4">
                <Clock className="w-3 h-3" />
                <span>{new Date(log.created_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
