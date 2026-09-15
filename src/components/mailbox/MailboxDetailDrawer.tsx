"use client";

import { useState, useEffect } from "react";
import {
  X,
  RefreshCw,
  Play,
  Folder,
  Hash,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers,
  Database,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { MappingRow, MessageLedgerRow } from "@/lib/db";
import { formatBytes, formatNumber } from "@/lib/utils/format";

interface MailboxDetailDrawerProps {
  projectId: string;
  mapping: MappingRow | null;
  onClose: () => void;
  onRevalidate: (mappingId: string) => Promise<void>;
  onOpenDiscovery: (mapping: MappingRow) => void;
  onOpenMigration: (mapping: MappingRow) => void;
  onEdit: (mapping: MappingRow) => void;
}

export default function MailboxDetailDrawer({
  projectId,
  mapping,
  onClose,
  onRevalidate,
  onOpenDiscovery,
  onOpenMigration,
  onEdit,
}: MailboxDetailDrawerProps) {
  const [ledgerEntries, setLedgerEntries] = useState<MessageLedgerRow[]>([]);
  const [baselineData, setBaselineData] = useState<any | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [tab, setTab] = useState<"OVERVIEW" | "LEDGER" | "FOLDERS">("OVERVIEW");

  useEffect(() => {
    if (!mapping) return;

    // Fetch message ledger for this mapping
    const fetchDetails = async () => {
      setLoadingLedger(true);
      try {
        const [ledgerRes, projectRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/ledger?mappingId=${mapping.id}`),
          fetch(`/api/projects/${projectId}`),
        ]);

        if (ledgerRes.ok) {
          const ledgerJson = await ledgerRes.json();
          setLedgerEntries(ledgerJson);
        }

        if (projectRes.ok) {
          const projData = await projectRes.json();
          const foundBaseline = projData.baselines?.find(
            (b: any) => b.mapping_id === mapping.id
          );
          if (foundBaseline && foundBaseline.folder_inventory_json) {
            try {
              setBaselineData({
                ...foundBaseline,
                folders: JSON.parse(foundBaseline.folder_inventory_json),
              });
            } catch {
              // ignore json parse error
            }
          }
        }
      } catch {
        // ignore
      } finally {
        setLoadingLedger(false);
      }
    };

    fetchDetails();
  }, [projectId, mapping?.id]);

  if (!mapping) return null;

  const handleRunRevalidate = async () => {
    setRevalidating(true);
    try {
      await onRevalidate(mapping.id);
    } finally {
      setRevalidating(false);
    }
  };

  const isReady = mapping.overall_status === "READY" || mapping.overall_status === "MIGRATED";
  const isMigrating = mapping.overall_status === "MIGRATING";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <div className="flex items-center space-x-2">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  mapping.overall_status === "READY"
                    ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                    : mapping.overall_status === "MIGRATED"
                    ? "bg-blue-950 text-blue-400 border-blue-800"
                    : mapping.overall_status === "WARNING"
                    ? "bg-amber-950 text-amber-400 border-amber-800"
                    : "bg-red-950 text-red-400 border-red-800"
                }`}
              >
                {mapping.overall_status}
              </span>
              <span className="text-xs text-slate-400 font-mono">Rev #{mapping.revision}</span>
            </div>
            <h2 className="text-base font-bold text-white mt-1 truncate">{mapping.source_email}</h2>
            <p className="text-xs text-slate-400 truncate">Target: {mapping.target_email}</p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-5 border-b border-slate-800 bg-slate-900/40 text-xs font-medium text-slate-400">
          <button
            onClick={() => setTab("OVERVIEW")}
            className={`py-3 px-3 border-b-2 transition cursor-pointer ${
              tab === "OVERVIEW"
                ? "border-blue-500 text-blue-400 font-semibold"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Telemetry & Overview
          </button>
          <button
            onClick={() => setTab("FOLDERS")}
            className={`py-3 px-3 border-b-2 transition cursor-pointer ${
              tab === "FOLDERS"
                ? "border-blue-500 text-blue-400 font-semibold"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Folder Inventory {baselineData?.folders ? `(${baselineData.folders.length})` : ""}
          </button>
          <button
            onClick={() => setTab("LEDGER")}
            className={`py-3 px-3 border-b-2 transition cursor-pointer ${
              tab === "LEDGER"
                ? "border-blue-500 text-blue-400 font-semibold"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Message Ledger ({ledgerEntries.length})
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {tab === "OVERVIEW" && (
            <div className="space-y-6">
              {/* Status Breakdown Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400">Zoho IMAP (TLS 993)</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        mapping.zoho_status === "READY"
                          ? "bg-emerald-950 text-emerald-400"
                          : mapping.zoho_status === "CREDENTIAL_PURGED"
                          ? "bg-purple-950 text-purple-400"
                          : "bg-red-950 text-red-400"
                      }`}
                    >
                      {mapping.zoho_status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Credential: {mapping.credential_status === "PRESENT" ? "🔒 Encrypted AES-256" : mapping.credential_status}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400">Google Workspace API</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        mapping.google_status === "READY"
                          ? "bg-emerald-950 text-emerald-400"
                          : "bg-red-950 text-red-400"
                      }`}
                    >
                      {mapping.google_status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Delegation: Domain-Wide Profile Check
                  </p>
                </div>
              </div>

              {/* Error Callout if any */}
              {mapping.safe_error_reason && (
                <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-300 text-xs space-y-2">
                  <div className="font-semibold flex items-center space-x-1.5 text-red-200">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span>Diagnostics & Safe Resolution:</span>
                  </div>
                  <p className="mt-1 leading-relaxed text-slate-200">{mapping.safe_error_reason}</p>
                  {mapping.safe_error_reason.includes("Zoho") && (
                    <div className="mt-2 text-[11px] text-slate-400 bg-black/40 p-2.5 rounded-lg border border-red-900/40 space-y-1">
                      <span className="font-semibold text-amber-300">💡 Zoho Self-Remediation Guidance:</span>
                      <p>1. If Zoho 2FA is enabled, generate and enter an App-Specific Password via Edit Mapping.</p>
                      <p>2. Verify IMAP access is toggled ON in Zoho Mail settings.</p>
                    </div>
                  )}
                  {mapping.safe_error_reason.includes("Google") && (
                    <div className="mt-2 text-[11px] text-slate-400 bg-black/40 p-2.5 rounded-lg border border-red-900/40 space-y-1">
                      <span className="font-semibold text-blue-300">💡 Google Delegation Guidance:</span>
                      <p>Authorize the Service Account Client ID in Google Workspace Admin Console under Security &gt; API controls &gt; Manage Domain Wide Delegation.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Baseline Summary Card */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                    <Database className="w-4 h-4 text-indigo-400" />
                    <span>Discovery Baseline Scope (S)</span>
                  </h3>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      mapping.discovery_status === "BASELINE_REVIEWED"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : mapping.discovery_status === "DISCOVERED"
                        ? "bg-indigo-950 text-indigo-400 border border-indigo-800"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {mapping.discovery_status}
                  </span>
                </div>

                {baselineData ? (
                  <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">Total Messages</span>
                      <span className="text-sm font-bold text-white">{formatNumber(baselineData.total_messages)}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">Scope Size</span>
                      <span className="text-sm font-bold text-white">
                        {formatBytes(baselineData.total_size_bytes)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">Folders</span>
                      <span className="text-sm font-bold text-white">{baselineData.folders?.length || 0}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    No discovery baseline recorded yet. Run discovery to inspect source mailbox hierarchy.
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mailbox Actions</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleRunRevalidate}
                    disabled={revalidating || isMigrating}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                    title={isMigrating ? "Mailbox is actively migrating" : "Re-test IMAP and Google access"}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${revalidating ? "animate-spin" : ""}`} />
                    <span>{revalidating ? "Revalidating..." : isMigrating ? "Migrating Active" : "Revalidate Mailbox"}</span>
                  </button>

                  <button
                    onClick={() => onEdit(mapping)}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Edit Row / Password</span>
                  </button>

                  <button
                    onClick={() => onOpenDiscovery(mapping)}
                    disabled={!isReady}
                    className="p-2.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/60 text-xs font-medium transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Discovery & Baseline</span>
                  </button>

                  {isMigrating ? (
                    <button
                      onClick={() => onOpenMigration(mapping)}
                      className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center justify-center space-x-2 cursor-pointer shadow-md shadow-emerald-600/20"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-200 animate-ping" />
                      <span>Inspect Live Migration</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onOpenMigration(mapping)}
                      disabled={!isReady}
                      className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 shadow-md shadow-blue-600/20"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Migrate Mailbox</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "FOLDERS" && (
            <div className="space-y-3">
              {baselineData?.folders && baselineData.folders.length > 0 ? (
                baselineData.folders.map((folder: any, i: number) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2.5">
                      <Folder className="w-4 h-4 text-blue-400" />
                      <div>
                        <span className="font-semibold text-white block">{folder.path}</span>
                        <span className="text-[10px] text-slate-500">
                          Delimiter: {folder.delimiter || "/"} · {folder.flags?.join(", ") || "Standard"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-emerald-400 block">{formatNumber(folder.messageCount)} msgs</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatBytes(folder.sizeBytes)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No folder baseline available. Run discovery to retrieve remote Zoho folder list.
                </div>
              )}
            </div>
          )}

          {tab === "LEDGER" && (
            <div className="space-y-3">
              {loadingLedger ? (
                <div className="text-center py-12 text-slate-500 text-xs">Loading message ledger...</div>
              ) : ledgerEntries.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No messages transferred or recorded in ledger yet.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-400 mb-2 flex items-center justify-between">
                    <span>Persistent RFC822 Transfer Proof</span>
                    <span>{ledgerEntries.length} items logged</span>
                  </div>
                  {ledgerEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] text-blue-400">
                          {entry.source_folder} #UID-{entry.source_uid}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            entry.transfer_status === "VERIFIED"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : entry.transfer_status === "SKIPPED"
                              ? "bg-slate-800 text-slate-400"
                              : "bg-red-950 text-red-400 border border-red-800"
                          }`}
                        >
                          {entry.transfer_status}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate font-mono">
                        SHA256: {entry.rfc822_hash}
                      </div>
                      {entry.target_message_id && (
                        <div className="text-[10px] text-slate-500 truncate">
                          Target ID: {entry.target_message_id} · {entry.size_bytes} bytes
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
