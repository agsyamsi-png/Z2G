"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Edit2,
  Play,
  Search,
  KeyRound,
  Compass,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { MappingRow } from "@/lib/db";
import { formatBytes, formatNumber } from "@/lib/utils/format";

interface MailboxTableProps {
  projectId: string;
  mappings: MappingRow[];
  selectedIds: string[];
  onSelectChange: (ids: string[]) => void;
  onRefresh: () => void;
  onOpenDiscovery: (mapping: MappingRow) => void;
  onOpenMigration: (mapping: MappingRow) => void;
  onInspect?: (mapping: MappingRow) => void;
  onOpenRemediation?: () => void;
  editingMapping?: MappingRow | null;
  onEditChange?: (m: MappingRow | null) => void;
  onBulkDiscover?: (mappingIds?: string[], autoAccept?: boolean) => void;
  onBulkValidate?: (mappingIds?: string[]) => void;
  onBulkMigrate?: (mappingIds?: string[]) => void;
  discovering?: boolean;
  validating?: boolean;
}

export default function MailboxTable({
  projectId,
  mappings,
  selectedIds,
  onSelectChange,
  onRefresh,
  onOpenDiscovery,
  onOpenMigration,
  onInspect,
  onOpenRemediation,
  editingMapping: externalEditingMapping,
  onEditChange,
  onBulkDiscover,
  onBulkValidate,
  onBulkMigrate,
  discovering = false,
  validating = false,
}: MailboxTableProps) {
  const [filter, setFilter] = useState<"ALL" | "MIGRATING" | "READY" | "WARNING" | "FAILED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [internalEditingMapping, setInternalEditingMapping] = useState<MappingRow | null>(null);
  
  const editingMapping = externalEditingMapping !== undefined ? externalEditingMapping : internalEditingMapping;
  const setEditingMapping = onEditChange || setInternalEditingMapping;

  const [editSourceEmail, setEditSourceEmail] = useState("");
  const [editTargetEmail, setEditTargetEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const migratingCount = mappings.filter((m) => m.overall_status === "MIGRATING").length;
  const readyCount = mappings.filter((m) => m.overall_status === "READY" || m.overall_status === "MIGRATED").length;
  const warningCount = mappings.filter(
    (m) =>
      m.overall_status === "WARNING" ||
      m.zoho_status === "RETRY_PENDING" ||
      m.google_status === "RETRY_PENDING" ||
      m.overall_status === "PENDING"
  ).length;
  const failedCount = mappings.filter((m) => m.overall_status === "FAILED").length;

  useEffect(() => {
    if (editingMapping) {
      setEditSourceEmail(editingMapping.source_email);
      setEditTargetEmail(editingMapping.target_email);
      setEditPassword("");
      setEditError(null);
    }
  }, [editingMapping]);

  // Filter mappings
  const filteredMappings = mappings.filter((m) => {
    // Search query
    const matchesSearch =
      m.source_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.target_email.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filter === "MIGRATING") return m.overall_status === "MIGRATING";
    if (filter === "READY") return m.overall_status === "READY" || m.overall_status === "MIGRATED";
    if (filter === "WARNING")
      return (
        m.overall_status === "WARNING" ||
        m.zoho_status === "RETRY_PENDING" ||
        m.google_status === "RETRY_PENDING" ||
        m.overall_status === "PENDING"
      );
    if (filter === "FAILED") return m.overall_status === "FAILED";
    return true;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectChange(filteredMappings.map((m) => m.id));
    } else {
      onSelectChange([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      onSelectChange([...selectedIds, id]);
    } else {
      onSelectChange(selectedIds.filter((item) => item !== id));
    }
  };

  const openEditModal = (m: MappingRow) => {
    setEditingMapping(m);
    setEditSourceEmail(m.source_email);
    setEditTargetEmail(m.target_email);
    setEditPassword(""); // NEVER prefill credentials
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMapping) return;

    setSavingEdit(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/mappings/${editingMapping.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_email: editSourceEmail,
          target_email: editTargetEmail,
          source_password: editPassword.trim() ? editPassword : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update mapping");
      }

      setEditingMapping(null);
      onRefresh();
    } catch (err: unknown) {
      setEditError((err as Error).message);
    } finally {
      setSavingEdit(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "READY":
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            <CheckCircle2 className="w-3 h-3" />
            <span>Ready</span>
          </span>
        );
      case "VALIDATING":
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-950/80 text-blue-400 border border-blue-800/60 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Validating</span>
          </span>
        );
      case "MIGRATING":
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-950/80 text-indigo-400 border border-indigo-800/60 animate-pulse">
            <Play className="w-3 h-3" />
            <span>Migrating</span>
          </span>
        );
      case "MIGRATED":
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-950/80 text-teal-300 border border-teal-800/60">
            <CheckCircle2 className="w-3 h-3" />
            <span>Migrated</span>
          </span>
        );
      case "PURGED":
      case "CREDENTIAL_PURGED":
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-950/80 text-purple-300 border border-purple-800/60">
            <KeyRound className="w-3 h-3" />
            <span>Purged</span>
          </span>
        );
      case "FAILED":
      case "ZOHO_AUTH_FAILED":
      case "ZOHO_IMAP_DISABLED":
      case "GOOGLE_USER_NOT_FOUND":
      case "GOOGLE_API_ACCESS_FAILED":
      case "DUPLICATE_MAPPING":
      case "INVALID_EMAIL":
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-950/80 text-red-400 border border-red-800/60">
            <XCircle className="w-3 h-3" />
            <span>{status.replace(/_/g, " ")}</span>
          </span>
        );
      case "WARNING":
      case "RETRY_PENDING":
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800/60">
            <AlertTriangle className="w-3 h-3" />
            <span>Warning</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <Clock className="w-3 h-3" />
            <span>Pending</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "ALL", label: `All (${mappings.length})` },
            ...(migratingCount > 0
              ? [{ id: "MIGRATING", label: `⚡ Migrating (${migratingCount})` }]
              : []),
            { id: "READY", label: `Ready (${readyCount})` },
            ...(warningCount > 0
              ? [{ id: "WARNING", label: `Warning (${warningCount})` }]
              : []),
            { id: "FAILED", label: `Failed (${failedCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filter === tab.id
                  ? tab.id === "MIGRATING"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-bold"
                    : "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : tab.id === "MIGRATING"
                  ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 border border-emerald-800/40"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search email addresses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-blue-500 w-full sm:w-64"
          />
        </div>
      </div>

      {/* Selected Items Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-950/40 border border-blue-800/60 p-3.5 rounded-2xl animate-in fade-in">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 rounded-lg bg-blue-900/60 text-blue-300 font-bold text-xs">
              {selectedIds.length} Selected
            </span>
            <span className="text-xs text-slate-300">Quick bulk operations:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onBulkDiscover && (
              <button
                onClick={() => onBulkDiscover(selectedIds, true)}
                disabled={discovering}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-600/20 transition disabled:opacity-50 cursor-pointer"
                title="Automatically scan folders and lock baseline for selected mailboxes"
              >
                <Compass className={`w-3.5 h-3.5 ${discovering ? "animate-spin" : ""}`} />
                <span>{discovering ? "Discovering..." : `⚡ Auto-Discover (${selectedIds.length})`}</span>
              </button>
            )}

            {onBulkMigrate && (
              <button
                onClick={() => onBulkMigrate(selectedIds)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition cursor-pointer"
                title="Migrate selected mailboxes to Google Workspace"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>⚡ Migrate Selected ({selectedIds.length})</span>
              </button>
            )}

            {onBulkValidate && (
              <button
                onClick={() => onBulkValidate(selectedIds)}
                disabled={validating}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${validating ? "animate-spin" : ""}`} />
                <span>{validating ? "Validating..." : `Validate (${selectedIds.length})`}</span>
              </button>
            )}

            <button
              onClick={() => onSelectChange([])}
              className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white transition"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <th className="p-3.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredMappings.length > 0 &&
                      filteredMappings.every((m) => selectedIds.includes(m.id))
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="p-3.5">Source Email (Zoho)</th>
                <th className="p-3.5">Target Email (Google)</th>
                <th className="p-3.5">Zoho Status</th>
                <th className="p-3.5">Google Status</th>
                <th className="p-3.5">Overall</th>
                <th className="p-3.5">Zoho Mailbox Size</th>
                <th className="p-3.5">Discovery (S)</th>
                <th className="p-3.5">Safe Reason / Notes</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredMappings.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500 text-xs">
                    No mailboxes found matching filter
                  </td>
                </tr>
              ) : (
                filteredMappings.map((mapping) => {
                  const mAny = mapping as any;
                  return (
                    <tr
                      key={mapping.id}
                      className="hover:bg-slate-800/30 transition group text-slate-300"
                    >
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(mapping.id)}
                          onChange={(e) => handleSelectOne(mapping.id, e.target.checked)}
                          className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="p-3.5 font-medium text-white">{mapping.source_email}</td>
                      <td className="p-3.5 font-medium text-slate-200">{mapping.target_email}</td>
                      <td className="p-3.5">{getStatusBadge(mapping.zoho_status)}</td>
                      <td className="p-3.5">{getStatusBadge(mapping.google_status)}</td>
                      <td className="p-3.5">{getStatusBadge(mapping.overall_status)}</td>
                      <td className="p-3.5 font-mono">
                        {mAny.zoho_storage ? (
                          <div>
                            <span className="font-bold text-white">
                              {mAny.zoho_storage.usedGb.toFixed(2)} GB
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              {mAny.zoho_storage.usedPercent.toFixed(1)}% of {mAny.zoho_storage.allottedGb} GB
                            </span>
                          </div>
                        ) : mAny.baseline_summary ? (
                          <div>
                            <span className="font-bold text-white">
                              {formatBytes(mAny.baseline_summary.total_size_bytes)}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              {formatNumber(mAny.baseline_summary.total_messages)} msgs
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <div className="space-y-0.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                              mapping.discovery_status === "BASELINE_REVIEWED"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                                : mapping.discovery_status === "DISCOVERED"
                                ? "bg-blue-950 text-blue-400 border border-blue-800/60"
                                : "text-slate-500 bg-slate-900 border border-slate-800"
                            }`}
                          >
                            {mapping.discovery_status === "BASELINE_REVIEWED"
                              ? "LOCKED (S)"
                              : mapping.discovery_status.replace("_", " ")}
                          </span>
                          {mAny.baseline_summary && (
                            <span className="text-[10px] text-slate-400 block font-mono">
                              {formatBytes(mAny.baseline_summary.total_size_bytes)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5 max-w-xs truncate text-slate-400" title={mapping.safe_error_reason || ""}>
                        {mapping.safe_error_reason || "—"}
                      </td>
                      <td className="p-3.5 text-right space-x-1 whitespace-nowrap">
                      {onInspect && (
                        <button
                          onClick={() => onInspect(mapping)}
                          title="Inspect Telemetry, Folders & Ledger"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white transition cursor-pointer inline-flex"
                        >
                          <Compass className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => openEditModal(mapping)}
                        title="Edit Mailbox / Password"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer inline-flex"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {mapping.overall_status === "MIGRATING" && (
                        <button
                          onClick={() => onOpenMigration(mapping)}
                          title="Inspect Live Streaming Migration"
                          className="px-2 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 transition cursor-pointer inline-flex items-center space-x-1 text-[11px] font-semibold shadow-sm shadow-emerald-900/30"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          <span>Inspect Live</span>
                        </button>
                      )}

                      {(mapping.overall_status === "READY" || mapping.overall_status === "MIGRATED") && (
                        <>
                          <button
                            onClick={() => onOpenDiscovery(mapping)}
                            title="Discover / Baseline Review"
                            className="p-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/50 transition cursor-pointer inline-flex"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onOpenMigration(mapping)}
                            title="Migrate Mailbox / Inspect Progress"
                            className="p-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/50 transition cursor-pointer inline-flex"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          </table>
        </div>
      </div>

      {/* Inline Edit Modal */}
      {editingMapping && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-white">Edit Mailbox Mapping</h3>
              <button
                onClick={() => setEditingMapping(null)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Source Email (Zoho)</label>
                <input
                  type="email"
                  required
                  value={editSourceEmail}
                  onChange={(e) => setEditSourceEmail(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Target Email (Google Workspace)
                </label>
                <input
                  type="email"
                  required
                  value={editTargetEmail}
                  onChange={(e) => setEditTargetEmail(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Replacement Source Credential (Optional)
                </label>
                <input
                  type="password"
                  placeholder="Enter new password to replace existing..."
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Never prefilled. Leave empty to preserve current encrypted credential.
                </span>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingMapping(null)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition cursor-pointer disabled:opacity-50"
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
