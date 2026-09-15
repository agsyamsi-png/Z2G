"use client";

import { useState, useEffect } from "react";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  ExternalLink,
  RefreshCw,
  Server,
  KeyRound,
  Wrench,
  Check,
  Play,
  Zap,
} from "lucide-react";
import { ProjectDiagnosticReport } from "@/lib/remediation/remediationEngine";

interface SelfRemediationModalProps {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SelfRemediationModal({
  projectId,
  onClose,
  onSuccess,
}: SelfRemediationModalProps) {
  const [activeTab, setActiveTab] = useState<"GOOGLE" | "ZOHO" | "SIMULATION">("GOOGLE");
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ProjectDiagnosticReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [copiedClientId, setCopiedClientId] = useState(false);
  const [copiedScopes, setCopiedScopes] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/remediation`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load diagnostics");
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
    fetchDiagnostics();
  }, [projectId]);

  const copyToClipboard = (text: string, type: "CLIENT_ID" | "SCOPES") => {
    navigator.clipboard.writeText(text);
    if (type === "CLIENT_ID") {
      setCopiedClientId(true);
      setTimeout(() => setCopiedClientId(false), 2000);
    } else {
      setCopiedScopes(true);
      setTimeout(() => setCopiedScopes(false), 2000);
    }
  };

  const handleAction = async (action: string, payload?: any) => {
    setActionLoading(action);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/remediation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Action failed");
      }
      setActionMessage(data.message);
      await fetchDiagnostics();
      onSuccess();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Self-Remediation & Diagnostics Engine
              </h2>
              <p className="text-xs text-slate-400">
                Automated root cause diagnostics and guided resolution for Zoho and Google Workspace
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Global Notifications */}
        {actionMessage && (
          <div className="mb-4 p-3.5 bg-emerald-950/60 border border-emerald-800 rounded-2xl text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{actionMessage}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3.5 bg-red-950/60 border border-red-800 rounded-2xl text-red-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex space-x-2 border-b border-slate-800 pb-3 mb-6">
          <button
            onClick={() => setActiveTab("GOOGLE")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center space-x-2 ${
              activeTab === "GOOGLE"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Google Delegation Setup</span>
            {report?.google && (
              <span
                className={`w-2 h-2 rounded-full ${
                  report.google.delegationActive ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            )}
          </button>

          <button
            onClick={() => setActiveTab("ZOHO")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center space-x-2 ${
              activeTab === "ZOHO"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Zoho IMAP & Host Auto-Detect</span>
            {report?.zoho && (
              <span
                className={`w-2 h-2 rounded-full ${
                  report.zoho.failedAccountsCount === 0 ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            )}
          </button>

          <button
            onClick={() => setActiveTab("SIMULATION")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center space-x-2 ${
              activeTab === "SIMULATION"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Offline Sandbox / Simulation</span>
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-xs">Running live connectivity tests against Zoho & Google...</p>
          </div>
        ) : !report ? (
          <div className="text-center py-8 text-xs text-slate-500">No diagnostic report available.</div>
        ) : (
          <div>
            {/* TAB 1: GOOGLE DOMAIN-WIDE DELEGATION */}
            {activeTab === "GOOGLE" && (
              <div className="space-y-6">
                <div
                  className={`p-4 rounded-2xl border ${
                    report.google.delegationActive
                      ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200"
                      : "bg-red-950/40 border-red-800/60 text-red-200"
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    {report.google.delegationActive ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm">
                        {report.google.delegationActive
                          ? "Domain-Wide Delegation Active & Verified"
                          : "Google Workspace Domain-Wide Delegation Not Authorized"}
                      </h4>
                      <p className="text-xs text-slate-300">
                        {report.google.delegationActive
                          ? `The Service Account is authorized to impersonate mailboxes on domain ${report.google.targetDomain}.`
                          : "Google rejected API access because the Service Account Client ID has not been granted OAuth scopes in the Google Workspace Admin Console."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Setup Fields */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4 text-xs">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-semibold text-slate-300">1. Service Account Client ID</label>
                      <button
                        onClick={() => copyToClipboard(report.google.clientId, "CLIENT_ID")}
                        className="inline-flex items-center space-x-1 text-blue-400 hover:text-blue-300 transition cursor-pointer"
                      >
                        {copiedClientId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedClientId ? "Copied!" : "Copy Client ID"}</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      readOnly
                      value={report.google.clientId}
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl font-mono text-slate-200 text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-semibold text-slate-300">
                        2. Required OAuth Scopes (Comma-Separated)
                      </label>
                      <button
                        onClick={() =>
                          copyToClipboard(report.google.requiredScopes.join(","), "SCOPES")
                        }
                        className="inline-flex items-center space-x-1 text-blue-400 hover:text-blue-300 transition cursor-pointer"
                      >
                        {copiedScopes ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedScopes ? "Copied!" : "Copy All Scopes"}</span>
                      </button>
                    </div>
                    <textarea
                      readOnly
                      rows={2}
                      value={report.google.requiredScopes.join(",")}
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl font-mono text-slate-200 text-xs focus:outline-none"
                    />
                  </div>
                </div>

                {/* Step-by-Step Instructions */}
                <div className="space-y-2 text-xs">
                  <h4 className="font-bold text-slate-200">How to authorize in Google Workspace Admin Console:</h4>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-400 pl-1">
                    {report.google.resolutionSteps.map((step, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                  <a
                    href="https://admin.google.com/ac/owl/domainwidedelegation"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                  >
                    <span>Open Google Admin Console</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={() => handleAction("RETRY_VALIDATION")}
                    disabled={actionLoading !== null}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/20 transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${actionLoading === "RETRY_VALIDATION" ? "animate-spin" : ""}`}
                    />
                    <span>Re-Test Google Delegation & Validate</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: ZOHO IMAP & HOST AUTO-DETECT */}
            {activeTab === "ZOHO" && (
              <div className="space-y-6 text-xs">
                {/* Host Health Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-200">Candidate Zoho IMAP Hosts & Live Ping</h4>
                    <span className="text-[11px] text-slate-400">
                      Currently Configured: <span className="font-mono text-white">{report.zoho.configuredHost}</span>
                    </span>
                  </div>

                  <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold">
                          <th className="p-3">Host Endpoint</th>
                          <th className="p-3">Port</th>
                          <th className="p-3">Reachability</th>
                          <th className="p-3">Latency</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {report.zoho.hostChecks.map((check) => (
                          <tr key={check.host} className="hover:bg-slate-900/40">
                            <td className="p-3 font-medium text-slate-200">
                              {check.host}
                              {check.host === report.zoho.configuredHost && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-blue-950 text-blue-400 border border-blue-800">
                                  Active
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-slate-400">{check.port}</td>
                            <td className="p-3">
                              {check.reachable ? (
                                <span className="text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Reachable
                                </span>
                              ) : (
                                <span className="text-red-400 flex items-center gap-1">
                                  <XCircle className="w-3.5 h-3.5" /> Unreachable
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-slate-400">{check.responseTimeMs} ms</td>
                            <td className="p-3 text-right">
                              {check.host !== report.zoho.configuredHost && (
                                <button
                                  onClick={() =>
                                    handleAction("SWITCH_ZOHO_HOST", { newHost: check.host })
                                  }
                                  disabled={actionLoading !== null}
                                  className="px-2.5 py-1 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white font-sans text-xs transition cursor-pointer"
                                >
                                  Use Host
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Zoho Instructions */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <h4 className="font-bold text-slate-200 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span>Why did Zoho credentials fail?</span>
                  </h4>
                  <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
                    {report.zoho.instructions.map((inst, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {inst}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Re-validate Trigger */}
                <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => handleAction("RETRY_VALIDATION")}
                    disabled={actionLoading !== null}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${actionLoading === "RETRY_VALIDATION" ? "animate-spin" : ""}`}
                    />
                    <span>Re-Run Zoho Preflight Validation</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: SIMULATION / SANDBOX */}
            {activeTab === "SIMULATION" && (
              <div className="space-y-6 text-xs">
                <div className="bg-purple-950/40 border border-purple-800/60 rounded-2xl p-4 text-purple-200 space-y-2">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4 text-purple-400" />
                    <span>Offline Sandbox & Evaluation Mode</span>
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    If your Google Workspace Domain-Wide Delegation is waiting for Super Admin approval or
                    you are evaluating the platform on a local test environment, you can enable
                    Simulation Mode.
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Simulation mode validates all 216 accounts locally, generates full Gigabyte-scale baseline
                    inventories (S = 899.75 GB), and allows full end-to-end testing of discovery,
                    telemetry, ledger deduplication, and mathematical reconciliation.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 p-4 rounded-2xl">
                  <div>
                    <h5 className="font-bold text-white">Enable Sandbox Simulation</h5>
                    <p className="text-slate-400 text-[11px]">
                      Runs preflight, discovery, and reconciliation pipelines in high-fidelity sandbox mode.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      await handleAction("ENABLE_SIMULATION");
                      await handleAction("RETRY_VALIDATION");
                    }}
                    disabled={actionLoading !== null}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold shadow-lg shadow-purple-600/20 transition cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Enable & Auto-Validate All</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-800 mt-6 text-xs">
          <span className="text-slate-500">
            Project: <span className="text-slate-400 font-mono">{projectId}</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
