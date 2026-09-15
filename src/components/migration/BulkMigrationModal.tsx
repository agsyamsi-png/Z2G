"use client";

import { useState, useEffect } from "react";
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ExternalLink,
  X,
  Server,
  Cloud,
  ShieldCheck,
  Inbox,
  ArrowRight,
} from "lucide-react";
import { BulkMigrationStatus, ActiveWorkerInfo } from "@/lib/migration/bulkMigrationEngine";
import { MappingRow } from "@/lib/db";

interface BulkMigrationModalProps {
  projectId: string;
  targetMappingIds?: string[];
  onClose: () => void;
  onOpenIndividualMigration?: (mapping: MappingRow) => void;
  onInspectWorker?: (mappingId: string) => void;
  onDataRefresh?: () => void;
}

export default function BulkMigrationModal({
  projectId,
  targetMappingIds,
  onClose,
  onOpenIndividualMigration,
  onInspectWorker,
  onDataRefresh,
}: BulkMigrationModalProps) {
  const [status, setStatus] = useState<BulkMigrationStatus | null>(null);
  const [concurrency, setConcurrency] = useState<number>(2);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/migrate/bulk`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setStatus(data);
        if (data.concurrency) setConcurrency(data.concurrency);
        if (data.state === "COMPLETED" && onDataRefresh) {
          onDataRefresh();
        }
      }
    } catch {
      // ignore network glitch in polling
    }
  };

  const executeAction = async (action: "start" | "pause" | "resume" | "stop") => {
    setLoadingAction(action);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/migrate/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          concurrency,
          mappingIds: targetMappingIds,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to execute ${action}`);
      }

      setStatus(data);
      if (onDataRefresh) onDataRefresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleConcurrencyChange = async (n: number) => {
    setConcurrency(n);
    try {
      const res = await fetch(`/api/projects/${projectId}/migrate/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_concurrency",
          concurrency: n,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);
    return () => clearInterval(interval);
  }, []);

  const hasActiveWorkers = (status?.activeWorkers?.length || 0) > 0;
  const isQueueRunning = (status?.isQueueRunning ?? false) || (hasActiveWorkers && status?.state !== "PAUSED" && status?.state !== "STOPPED");
  const isQueuePaused = status?.state === "PAUSED" || (status?.isQueuePaused ?? false);
  const isCompleted = status?.state === "COMPLETED";

  const totalEligible = status?.totalEligible || 1;
  const completedCount = status?.completedCount || 0;
  const overallPercent = Math.min(100, Math.round((completedCount / totalEligible) * 100));

  const totalMB = ((status?.totalBytesTransferred || 0) / (1024 * 1024)).toFixed(1);
  const totalGB = ((status?.totalBytesTransferred || 0) / (1024 * 1024 * 1024)).toFixed(2);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800/60 shadow-lg shadow-emerald-950/50">
              <Layers className={`w-5 h-5 ${isQueueRunning || hasActiveWorkers ? "animate-pulse" : ""}`} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white">
                  Domain Bulk Migration Command Center
                </h3>
                {isQueueRunning ? (
                  <span className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                    <span>⚡ BULK QUEUE ACTIVE • {status?.activeWorkers.length || 0} STREAMING</span>
                  </span>
                ) : isQueuePaused ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-700/60">
                    ⏸ QUEUE PAUSED • {status?.activeWorkers.length || 0} IN-FLIGHT
                  </span>
                ) : hasActiveWorkers ? (
                  <span className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-950/80 text-sky-400 border border-sky-700/60">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping inline-block" />
                    <span>🔄 {status?.activeWorkers.length} BACKGROUND TRANSFERS ACTIVE</span>
                  </span>
                ) : isCompleted ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-950/80 text-blue-400 border border-blue-700/60">
                    ALL ELIGIBLE COMPLETED
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300">
                    READY TO MIGRATE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated parallel queue transferring Zoho mailboxes to Google Workspace
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition text-xs cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center space-x-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Domain Progress Overview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Domain-Wide Migration Progress</span>
              <span className="text-white font-bold font-mono">
                {completedCount} / {totalEligible} Accounts ({overallPercent}%)
              </span>
            </div>

            {/* Gradient Progress Bar */}
            <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-blue-500 transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(1, overallPercent)}%` }}
              />
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl">
                <span className="text-slate-500 block text-xs">Accounts Completed</span>
                <span className="text-lg font-bold text-white">
                  {completedCount}
                  <span className="text-xs font-normal text-slate-500 ml-1">/ {totalEligible}</span>
                </span>
                <span className="text-[11px] text-emerald-400 block mt-0.5 font-medium">
                  {status?.pendingCount || 0} Queued Remaining
                </span>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl">
                <span className="text-slate-500 block text-xs">Total Transferred</span>
                <span className="text-lg font-bold text-blue-400">
                  {Number(totalGB) > 1 ? `${totalGB} GB` : `${totalMB} MB`}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  {(status?.totalMessagesMigrated || 0).toLocaleString()} Messages
                </span>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl">
                <span className="text-slate-500 block text-xs">Active Workers</span>
                <span className="text-lg font-bold text-emerald-400">
                  {status?.activeWorkers.length || 0}
                  <span className="text-xs font-normal text-slate-500 ml-1">/ {concurrency}</span>
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Concurrent Mailboxes
                </span>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl">
                <span className="text-slate-500 block text-xs">Deduplication</span>
                <span className="text-lg font-bold text-teal-400">100% Safe</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Ledger & GWS Hash Verified
                </span>
              </div>
            </div>
          </div>

          {/* Active Workers Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-white flex items-center space-x-1.5">
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isQueueRunning || hasActiveWorkers ? "animate-spin" : ""}`} />
                <span>Active In-Flight Mailbox Workers ({status?.activeWorkers.length || 0})</span>
              </span>
              <span className="text-[11px] text-slate-500">Live IMAP ➔ Google Workspace streams</span>
            </div>

            {status?.activeWorkers && status.activeWorkers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {status.activeWorkers.map((worker) => {
                  const workerPct =
                    worker.total > 0
                      ? Math.min(100, Math.round((worker.migrated / worker.total) * 100))
                      : 0;

                  return (
                    <div
                      key={worker.jobId}
                      className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="truncate max-w-[200px] sm:max-w-[240px]">
                          <span className="font-bold text-white block truncate font-mono">
                            {worker.sourceEmail}
                          </span>
                          <span className="text-[11px] text-slate-500 block truncate font-mono">
                            ➔ {worker.targetEmail}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 text-[10px] font-semibold">
                            {worker.stage}
                          </span>
                          {onInspectWorker && (
                            <button
                              onClick={() => onInspectWorker(worker.mappingId)}
                              className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 text-[10px] font-medium transition cursor-pointer flex items-center space-x-1"
                              title="Inspect live IMAP stream"
                            >
                              <ExternalLink className="w-2.5 h-2.5 text-emerald-400" />
                              <span>Live</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">
                            Folder: <code className="text-amber-300 font-mono">{worker.currentFolder}</code>
                          </span>
                          <span className="text-slate-400 font-mono">
                            UID #{worker.currentUid}
                          </span>
                        </div>

                        <div className="truncate text-slate-400 text-[11px]">
                          Subject: <span className="text-slate-200">"{worker.currentSubject}"</span>
                        </div>

                        <div className="space-y-1 pt-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">
                              {worker.migrated.toLocaleString()} / {worker.total.toLocaleString()} msgs
                            </span>
                            <span className="text-emerald-400 font-bold font-mono">
                              {workerPct}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                              style={{ width: `${Math.max(1, workerPct)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-950/50 text-xs text-slate-500">
                {isQueueRunning
                  ? "Initializing workers..."
                  : isCompleted
                  ? "All mailboxes have successfully completed migration!"
                  : "No mailboxes currently migrating. Click 'Start Bulk Migration' below to begin."}
              </div>
            )}
          </div>

          {/* Queue Settings & Guidelines */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="font-semibold text-white block">Concurrency Rate Control</span>
                <span className="text-[11px] text-slate-400">
                  Number of mailboxes transferred in parallel (dynamically adjustable while running)
                </span>
              </div>

              <div className="flex items-center space-x-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => handleConcurrencyChange(n)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                      concurrency === n
                        ? "bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {n} {n === 1 ? "Worker" : "Workers"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-slate-950/40">
          <div className="text-xs text-slate-500 flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
            <span>State persisted across browser refreshes</span>
            {hasActiveWorkers && !isQueueRunning && (
              <span className="text-teal-400 font-mono hidden md:inline ml-2">
                • {status?.activeWorkers.length} active background transfers running smoothly
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {status === null ? (
              <div className="flex items-center space-x-2 text-slate-400 text-xs py-2 px-3">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400" />
                <span>Syncing queue status...</span>
              </div>
            ) : isQueueRunning ? (
              <>
                <button
                  onClick={() => executeAction("pause")}
                  disabled={loadingAction === "pause"}
                  className="px-4 py-2 bg-amber-950/80 hover:bg-amber-900/80 text-amber-300 border border-amber-800/80 rounded-xl text-xs font-medium transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>{loadingAction === "pause" ? "Pausing..." : "Pause Queue"}</span>
                </button>

                <button
                  onClick={() => {
                    if (window.confirm("Are you sure you want to stop the bulk migration queue? Active transfers will be cancelled.")) {
                      executeAction("stop");
                    }
                  }}
                  disabled={loadingAction === "stop"}
                  className="px-4 py-2 bg-red-950/80 hover:bg-red-900/80 text-red-300 border border-red-800/80 rounded-xl text-xs font-medium transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>{loadingAction === "stop" ? "Stopping..." : "Stop Queue"}</span>
                </button>
              </>
            ) : isQueuePaused ? (
              <>
                <button
                  onClick={() => executeAction("resume")}
                  disabled={loadingAction === "resume"}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition cursor-pointer flex items-center space-x-1.5 shadow-lg shadow-emerald-600/20"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{loadingAction === "resume" ? "Resuming..." : "Resume Queue"}</span>
                </button>

                <button
                  onClick={() => {
                    if (window.confirm("Are you sure you want to stop the bulk migration queue?")) {
                      executeAction("stop");
                    }
                  }}
                  disabled={loadingAction === "stop"}
                  className="px-4 py-2 bg-red-950/80 hover:bg-red-900/80 text-red-300 border border-red-800/80 rounded-xl text-xs font-medium transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop Queue</span>
                </button>
              </>
            ) : isCompleted ? (
              <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold py-2 px-3 bg-emerald-950/60 border border-emerald-800/60 rounded-xl">
                <CheckCircle2 className="w-4 h-4" />
                <span>All Eligible Mailboxes Migrated</span>
              </div>
            ) : (
              <button
                onClick={() => executeAction("start")}
                disabled={loadingAction === "start" || (status?.pendingCount === 0 && !hasActiveWorkers)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-2 shadow-lg shadow-emerald-600/25"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {loadingAction === "start"
                    ? "Starting Bulk Migration..."
                    : `⚡ Start Bulk Migration (${targetMappingIds?.length ? targetMappingIds.length : (status?.pendingCount || totalEligible)} Accounts)`}
                </span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition cursor-pointer"
            >
              {isQueueRunning || hasActiveWorkers ? "Keep Running in Background" : "Close"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
