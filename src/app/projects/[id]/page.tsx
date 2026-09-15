"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Play,
  FileText,
  Compass,
  Lock,
  Upload,
  AlertTriangle,
  Server,
  ShieldCheck,
  Zap,
  Database,
  Layers,
  History,
  Settings,
  HardDrive,
  Wrench,
  Pause,
  Users,
  Send,
} from "lucide-react";
import { ProjectRow, MappingRow, DiscoveryBaselineRow, MigrationJobRow } from "@/lib/db";
import CsvUploadStep from "@/components/wizard/CsvUploadStep";
import ColumnMappingStep from "@/components/wizard/ColumnMappingStep";
import ImportSummaryStep from "@/components/wizard/ImportSummaryStep";
import MailboxTable from "@/components/mailbox/MailboxTable";
import MailboxDetailDrawer from "@/components/mailbox/MailboxDetailDrawer";
import PipelineTracker from "@/components/pipeline/PipelineTracker";
import LedgerExplorer from "@/components/ledger/LedgerExplorer";
import AuditLogsViewer from "@/components/logs/AuditLogsViewer";
import BaselineReviewModal from "@/components/discovery/BaselineReviewModal";
import MigrationProgressModal from "@/components/migration/MigrationProgressModal";
import BulkMigrationModal from "@/components/migration/BulkMigrationModal";
import ReconciliationReportModal from "@/components/reconciliation/ReconciliationReportModal";
import PurgeCredentialsModal from "@/components/security/PurgeCredentialsModal";
import ProjectSettingsModal from "@/components/project/ProjectSettingsModal";
import SelfRemediationModal from "@/components/remediation/SelfRemediationModal";

export default function ProjectDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);

  const [project, setProject] = useState<(ProjectRow & { has_service_account?: boolean }) | null>(null);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Workspace Tab
  const [activeTab, setActiveTab] = useState<"MAILBOXES" | "LEDGER" | "LOGS">("MAILBOXES");

  // Wizard State
  const [wizardStep, setWizardStep] = useState<"UPLOAD" | "MAP" | "SUMMARY" | "MAILBOXES">("MAILBOXES");
  const [rawCsvText, setRawCsvText] = useState<string>("");
  const [detectionResult, setDetectionResult] = useState<any | null>(null);
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [importSummary, setImportSummary] = useState<any | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);

  // Mailbox Table & Batch Actions State
  const [selectedMappingIds, setSelectedMappingIds] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [activeDrawerMapping, setActiveDrawerMapping] = useState<MappingRow | null>(null);
  const [editingMapping, setEditingMapping] = useState<MappingRow | null>(null);

  // Modal States
  const [activeDiscoveryMapping, setActiveDiscoveryMapping] = useState<MappingRow | null>(null);
  const [activeMigrationMapping, setActiveMigrationMapping] = useState<MappingRow | null>(null);
  const [showBulkMigrationModal, setShowBulkMigrationModal] = useState(false);
  const [bulkSelectedMappingIds, setBulkSelectedMappingIds] = useState<string[] | undefined>(undefined);
  const [bulkStatus, setBulkStatus] = useState<any | null>(null);
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRemediationModal, setShowRemediationModal] = useState(false);

  const fetchProjectData = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load project");
      }
      const data = await res.json();
      setProject(data.project);
      setMappings(data.mappings);

      // Refresh active drawer mapping if open
      if (activeDrawerMapping) {
        const updated = data.mappings.find((m: MappingRow) => m.id === activeDrawerMapping.id);
        if (updated) setActiveDrawerMapping(updated);
      }

      // If no mappings exist yet, default to upload wizard
      if (data.mappings.length === 0 && wizardStep === "MAILBOXES") {
        setWizardStep("UPLOAD");
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fetchBulkStatus = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/migrate/bulk`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBulkStatus(data);
        }
      }
    } catch {
      // ignore background polling glitches
    }
  };

  useEffect(() => {
    fetchProjectData();
    fetchBulkStatus();
    const interval = setInterval(fetchBulkStatus, 2500);
    return () => clearInterval(interval);
  }, [projectId]);

  // Handle CSV Wizard Transitions
  const handleUploadSuccess = (csvText: string, detection: any, hasHeader: boolean) => {
    setRawCsvText(csvText);
    setDetectionResult(detection);
    setHasHeaderRow(hasHeader);
    setWizardStep("MAP");
  };

  const handleCommitSuccess = (summary: any, result: any) => {
    setImportSummary(summary);
    setImportResult(result);
    setWizardStep("SUMMARY");
    fetchProjectData();
  };

  // Validation Actions
  const handleRunValidation = async (targetIds?: string[], autoDiscover = false) => {
    setValidating(true);
    if (autoDiscover) setDiscovering(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappingIds: targetIds && targetIds.length > 0 ? targetIds : undefined,
          concurrency: 5,
          autoDiscover,
          autoAccept: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Validation failed");
      }

      await fetchProjectData();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setValidating(false);
      setDiscovering(false);
    }
  };

  // Single Mailbox Revalidate
  const handleRevalidateSingle = async (mappingId: string) => {
    await handleRunValidation([mappingId]);
  };

  // Bulk Automated Discovery Action (runs on all ready mailboxes or selected items)
  const handleBulkDiscovery = async (targetIds?: string[], autoAccept = true) => {
    setDiscovering(true);
    setError(null);
    try {
      const targetList = targetIds && targetIds.length > 0
        ? targetIds
        : selectedMappingIds.length > 0
        ? selectedMappingIds
        : undefined;

      const res = await fetch(`/api/projects/${projectId}/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappingIds: targetList,
          autoAccept,
          concurrency: 5,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Bulk automated discovery failed");
      }

      await fetchProjectData();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setDiscovering(false);
    }
  };

  // One-Click 100% Automated Validate + Discover Pipeline
  const handleValidateAndDiscoverAll = async () => {
    await handleRunValidation(selectedMappingIds.length > 0 ? selectedMappingIds : undefined, true);
  };

  const handlePipelineAction = (action: "UPLOAD" | "VALIDATE" | "DISCOVER" | "MIGRATE" | "RECONCILE" | "PURGE") => {
    switch (action) {
      case "UPLOAD":
        setWizardStep("UPLOAD");
        break;
      case "VALIDATE":
        handleRunValidation();
        break;
      case "DISCOVER":
        handleBulkDiscovery(undefined, true);
        break;
      case "MIGRATE":
        setBulkSelectedMappingIds(undefined);
        setShowBulkMigrationModal(true);
        break;
      case "RECONCILE":
        setShowReconciliationModal(true);
        break;
      case "PURGE":
        setShowPurgeModal(true);
        break;
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-500 text-sm">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
        <span>Loading migration workspace...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-2xl text-red-300 text-sm">
          {error || "Project not found or was removed."}
        </div>
        <Link href="/" className="inline-flex items-center space-x-1.5 text-xs text-blue-400 hover:text-blue-300">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Projects</span>
        </Link>
      </div>
    );
  }

  const readyCount = mappings.filter((m) => m.overall_status === "READY" || m.overall_status === "MIGRATED").length;
  const migratedCount = mappings.filter((m) => m.overall_status === "MIGRATED").length;
  const migratingCount = mappings.filter((m) => m.overall_status === "MIGRATING").length;
  const failedCount = mappings.filter((m) => m.overall_status === "FAILED").length;
  const pendingCount = mappings.filter((m) => m.overall_status === "PENDING").length;
  const discoveredCount = mappings.filter((m) => m.discovery_status === "BASELINE_REVIEWED" || m.discovery_status === "DISCOVERED").length;

  const totalStorageGb = mappings.reduce((acc, m: any) => {
    if (m.zoho_storage?.usedGb) return acc + m.zoho_storage.usedGb;
    if (m.baseline_summary?.total_size_bytes) return acc + m.baseline_summary.total_size_bytes / (1024 * 1024 * 1024);
    return acc;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Top Navigation & Project Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-xl font-extrabold text-white tracking-tight">{project?.name}</h1>
            <span
              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                project?.status === "ACTIVE"
                  ? "bg-blue-950 text-blue-400 border-blue-800/60"
                  : project?.status === "SIGNED_OFF"
                  ? "bg-emerald-950 text-emerald-400 border-emerald-800/60"
                  : project?.status === "CREDENTIALS_PURGED"
                  ? "bg-purple-950 text-purple-400 border-purple-800/60"
                  : "bg-slate-800 text-slate-300 border-slate-700"
              }`}
            >
              {project?.status.replace("_", " ")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-400 ml-10">
            <span>IMAP Host: {project?.zoho_host}:{project?.zoho_port}</span>
            <span>·</span>
            <span>Total Mappings: {mappings.length}</span>
            <span>·</span>
            <span className="text-emerald-400 font-semibold">{readyCount} Ready</span>
            {failedCount > 0 && <span className="text-red-400 font-semibold">· {failedCount} Attention Needed</span>}
          </div>
        </div>

        {/* Global Quick Actions Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {wizardStep === "MAILBOXES" ? (
            <>
              {/* Primary Automation Action */}
              <button
                onClick={() => handleValidateAndDiscoverAll()}
                disabled={validating || discovering || mappings.length === 0}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition shadow-md shadow-indigo-600/25 disabled:opacity-50 cursor-pointer"
                title="Validate credentials and automatically discover folder inventory in one click"
              >
                <Zap className={`w-3.5 h-3.5 ${(validating || discovering) ? "animate-spin" : "text-amber-300"}`} />
                <span>
                  {validating
                    ? "Validating..."
                    : discovering
                    ? "Discovering..."
                    : selectedMappingIds.length > 0
                    ? `⚡ Validate & Auto-Discover (${selectedMappingIds.length})`
                    : "⚡ Validate & Auto-Discover All"}
                </span>
              </button>

              {/* Self-Remediation Diagnostic Trigger */}
              <button
                onClick={() => setShowRemediationModal(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-amber-500/30 text-xs font-semibold transition cursor-pointer"
                title="Run diagnostics and self-remediate Zoho IMAP or Google delegation issues"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span>Self-Remediation</span>
              </button>

              {/* Import / Add Mailboxes */}
              <button
                onClick={() => setWizardStep("UPLOAD")}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition cursor-pointer"
                title="Upload or import additional mailbox mappings"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Mailboxes</span>
              </button>

              {/* Infrastructure Settings */}
              <button
                onClick={() => setShowSettingsModal(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold transition cursor-pointer"
                title="Configure Zoho host/port and Google Service Account JSON"
              >
                <Settings className="w-3.5 h-3.5 text-blue-400" />
                <span>Settings</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setWizardStep("MAILBOXES")}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition cursor-pointer"
            >
              <span>Back to Mailboxes</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-2xl text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Self-Remediation Alert Banner */}
      {failedCount > 0 && wizardStep === "MAILBOXES" && (
        <div className="bg-gradient-to-r from-amber-950/50 via-slate-900 to-amber-950/30 border border-amber-800/50 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-lg animate-in fade-in">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-amber-300 text-sm">
                Preflight Issue: {failedCount} Mailbox{failedCount > 1 ? "es" : ""} Require Remediation
              </h4>
              <p className="text-slate-300 mt-0.5 leading-relaxed">
                Zoho IMAP credentials rejected (App Password / Host mismatch) or Google Workspace Domain-Wide Delegation OAuth scopes require authorization in Google Admin Console.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowRemediationModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow-md transition cursor-pointer shrink-0 inline-flex items-center space-x-2 self-start sm:self-center"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Launch Self-Remediation Engine</span>
          </button>
        </div>
      )}

      {/* Interactive Visual Pipeline Ribbon */}
      {project && wizardStep === "MAILBOXES" && (
        <PipelineTracker
          project={project}
          mappings={mappings}
          onAction={handlePipelineAction}
        />
      )}

      {/* Main Content Area: Wizard or Mailbox Hub */}
      {wizardStep === "UPLOAD" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <CsvUploadStep
            projectId={projectId}
            onUploadSuccess={handleUploadSuccess}
          />
        </div>
      )}

      {wizardStep === "MAP" && detectionResult && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <ColumnMappingStep
            projectId={projectId}
            rawCsv={rawCsvText}
            detection={detectionResult}
            hasHeaderRow={hasHeaderRow}
            onCommitSuccess={handleCommitSuccess}
            onBack={() => setWizardStep("UPLOAD")}
          />
        </div>
      )}

      {wizardStep === "SUMMARY" && importSummary && importResult && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <ImportSummaryStep
            summary={importSummary}
            result={importResult}
            onProceedToMailboxes={() => {
              setWizardStep("MAILBOXES");
              handleRunValidation();
            }}
            onReupload={() => setWizardStep("UPLOAD")}
          />
        </div>
      )}

      {wizardStep === "MAILBOXES" && (
        <div className="space-y-6">
          {/* Workspace Tabs Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-1">
            <div className="flex items-center space-x-2 text-xs">
              <button
                onClick={() => setActiveTab("MAILBOXES")}
                className={`py-2 px-4 rounded-xl font-bold transition flex items-center space-x-2 cursor-pointer ${
                  activeTab === "MAILBOXES"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "bg-slate-900/70 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Mailbox Inventory & Ops ({mappings.length})</span>
              </button>

              <button
                onClick={() => setActiveTab("LEDGER")}
                className={`py-2 px-4 rounded-xl font-bold transition flex items-center space-x-2 cursor-pointer ${
                  activeTab === "LEDGER"
                    ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
                    : "bg-slate-900/70 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Message Ledger & Proofs</span>
              </button>

              <button
                onClick={() => setActiveTab("LOGS")}
                className={`py-2 px-4 rounded-xl font-bold transition flex items-center space-x-2 cursor-pointer ${
                  activeTab === "LOGS"
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                    : "bg-slate-900/70 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Audit Trail & Security</span>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  setBulkSelectedMappingIds(undefined);
                  setShowBulkMigrationModal(true);
                }}
                className={`inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-lg ${
                  bulkStatus?.isQueueRunning || (bulkStatus?.activeWorkers && bulkStatus.activeWorkers.length > 0)
                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/20"
                    : bulkStatus?.isQueuePaused
                    ? "bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white shadow-amber-600/20"
                    : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/20"
                }`}
                title="Launch or inspect bulk migration across all ready mailboxes"
              >
                {bulkStatus?.isQueueRunning || (bulkStatus?.activeWorkers && bulkStatus.activeWorkers.length > 0) ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping inline-block" />
                    <span>⚡ Migration Active ({bulkStatus.activeWorkers?.length || 0} Streaming)</span>
                  </>
                ) : bulkStatus?.isQueuePaused ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>⏸ Migration Paused ({bulkStatus.activeWorkers?.length || 0} In-Flight)</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>⚡ Bulk Migrate All ({readyCount})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {activeTab === "MAILBOXES" && (
            <div className="space-y-6">
              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-slate-400 block font-medium">Domain Scope</span>
                    <span className="text-base font-bold text-white mt-0.5 block">{mappings.length} accounts</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-800/80 text-slate-300">
                    <Users className="w-4 h-4" />
                  </div>
                </div>

                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-slate-400 block font-medium">Preflight Verified</span>
                    <span className="text-base font-bold text-emerald-400 mt-0.5 block">{readyCount} ready</span>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>

                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-slate-400 block font-medium">Discovery Scope</span>
                    <span className="text-base font-bold text-indigo-400 mt-0.5 block">{discoveredCount} / {mappings.length}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-indigo-950/80 text-indigo-400 border border-indigo-800/40">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>

                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-slate-400 block font-medium">Migrated</span>
                    <span className="text-base font-bold text-teal-400 mt-0.5 block">{migratedCount} accounts</span>
                  </div>
                  <div className="p-2 rounded-xl bg-teal-950/80 text-teal-400 border border-teal-800/40">
                    <Send className="w-4 h-4" />
                  </div>
                </div>

                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-slate-400 block font-medium">Preflight Blocked</span>
                    <span className="text-base font-bold text-amber-400 mt-0.5 block">{failedCount} blocked</span>
                  </div>
                  <div className="p-2 rounded-xl bg-amber-950/80 text-amber-400 border border-amber-800/40">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Live Domain Migration Progress Banner */}
              {bulkStatus && (bulkStatus.isQueueRunning || bulkStatus.isQueuePaused || (bulkStatus.activeWorkers && bulkStatus.activeWorkers.length > 0)) && (
                <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-950 border border-emerald-700/60 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xl shadow-emerald-950/40 animate-in fade-in">
                  <div className="flex items-center space-x-3.5">
                    <div className="p-2.5 rounded-xl bg-emerald-900/50 border border-emerald-700/60 text-emerald-400 shadow-md">
                      <Play className="w-4 h-4 fill-current animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-white font-bold text-xs">
                          Domain Bulk Migration {bulkStatus.isQueuePaused ? "Paused" : "Active"}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                          <span>{bulkStatus.activeWorkers?.length || 0} Workers Streaming</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {bulkStatus.completedCount} / {bulkStatus.totalEligible} accounts completed (
                        {Math.round(((bulkStatus.completedCount || 0) / (bulkStatus.totalEligible || 1)) * 100)}%) •{" "}
                        {(bulkStatus.totalMessagesMigrated || 0).toLocaleString()} messages migrated (
                        {((bulkStatus.totalBytesTransferred || 0) / (1024 * 1024)).toFixed(1)} MB transferred)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setBulkSelectedMappingIds(undefined);
                        setShowBulkMigrationModal(true);
                      }}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md transition cursor-pointer"
                    >
                      Command Center
                    </button>
                  </div>
                </div>
              )}

              {/* Mailbox Table */}
              <MailboxTable
                projectId={projectId}
                mappings={mappings}
                selectedIds={selectedMappingIds}
                onSelectChange={setSelectedMappingIds}
                onRefresh={fetchProjectData}
                onOpenDiscovery={(m) => setActiveDiscoveryMapping(m)}
                onOpenMigration={(m) => setActiveMigrationMapping(m)}
                onInspect={(m) => setActiveDrawerMapping(m)}
                onOpenRemediation={() => setShowRemediationModal(true)}
                editingMapping={editingMapping}
                onEditChange={setEditingMapping}
                onBulkDiscover={(ids, autoAccept) => handleBulkDiscovery(ids, autoAccept)}
                onBulkValidate={(ids) => handleRunValidation(ids)}
                onBulkMigrate={(ids) => {
                  setBulkSelectedMappingIds(ids);
                  setShowBulkMigrationModal(true);
                }}
                discovering={discovering}
                validating={validating}
              />
            </div>
          )}

          {activeTab === "LEDGER" && (
            <LedgerExplorer projectId={projectId} />
          )}

          {activeTab === "LOGS" && (
            <AuditLogsViewer projectId={projectId} />
          )}
        </div>
      )}

      {/* Mailbox Detail Drawer */}
      {activeDrawerMapping && (
        <MailboxDetailDrawer
          projectId={projectId}
          mapping={activeDrawerMapping}
          onClose={() => setActiveDrawerMapping(null)}
          onRevalidate={handleRevalidateSingle}
          onOpenDiscovery={(m) => {
            setActiveDrawerMapping(null);
            setActiveDiscoveryMapping(m);
          }}
          onOpenMigration={(m) => {
            setActiveDrawerMapping(null);
            setActiveMigrationMapping(m);
          }}
          onEdit={(m) => {
            setActiveDrawerMapping(null);
            setEditingMapping(m);
          }}
        />
      )}

      {/* Modals */}
      {activeDiscoveryMapping && (
        <BaselineReviewModal
          projectId={projectId}
          mapping={activeDiscoveryMapping}
          onClose={() => setActiveDiscoveryMapping(null)}
          onBaselineReviewed={fetchProjectData}
        />
      )}

      {activeMigrationMapping && (
        <MigrationProgressModal
          projectId={projectId}
          mapping={activeMigrationMapping}
          jobType={activeMigrationMapping.overall_status === "MIGRATED" ? "DELTA" : "INITIAL"}
          onClose={() => setActiveMigrationMapping(null)}
          onMigrationComplete={fetchProjectData}
        />
      )}

      {showBulkMigrationModal && (
        <BulkMigrationModal
          projectId={projectId}
          targetMappingIds={bulkSelectedMappingIds}
          onClose={() => setShowBulkMigrationModal(false)}
          onOpenIndividualMigration={(m) => {
            setShowBulkMigrationModal(false);
            setActiveMigrationMapping(m);
          }}
          onInspectWorker={(mappingId) => {
            setShowBulkMigrationModal(false);
            const targetMapping = mappings.find((m) => m.id === mappingId);
            if (targetMapping) {
              setActiveMigrationMapping(targetMapping);
            }
          }}
          onDataRefresh={fetchProjectData}
        />
      )}

      {showReconciliationModal && (
        <ReconciliationReportModal
          projectId={projectId}
          onClose={() => setShowReconciliationModal(false)}
          onSignOffComplete={fetchProjectData}
        />
      )}

      {showPurgeModal && project && (
        <PurgeCredentialsModal
          projectId={projectId}
          projectName={project.name}
          selectedMappingIds={selectedMappingIds.length > 0 ? selectedMappingIds : undefined}
          onClose={() => setShowPurgeModal(false)}
          onPurgeComplete={fetchProjectData}
        />
      )}

      {showSettingsModal && project && (
        <ProjectSettingsModal
          projectId={projectId}
          initialName={project.name}
          initialZohoHost={project.zoho_host}
          initialZohoPort={project.zoho_port}
          hasServiceAccount={!!project.has_service_account}
          onClose={() => setShowSettingsModal(false)}
          onSuccess={fetchProjectData}
        />
      )}

      {showRemediationModal && (
        <SelfRemediationModal
          projectId={projectId}
          onClose={() => setShowRemediationModal(false)}
          onSuccess={fetchProjectData}
        />
      )}
    </div>
  );
}
