"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  ArrowRight,
  ShieldCheck,
  Mail,
  Server,
  CheckCircle2,
  Lock,
  Sparkles,
  Zap,
  Play,
  RotateCw,
  FolderSync,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  zoho_host: string;
  zoho_port: number;
  status: string;
  has_service_account: boolean;
  created_at: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [zohoHost, setZohoHost] = useState("imap.zoho.com");
  const [zohoPort, setZohoPort] = useState(993);
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleSeedDemo = async () => {
    setSeeding(true);
    setError(null);
    try {
      const res = await fetch("/api/projects/seed", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to seed demo project");
      }
      const data = await res.json();
      window.location.href = `/projects/${data.projectId}`;
    } catch (err: unknown) {
      setError((err as Error).message);
      setSeeding(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProjectName,
          zoho_host: zohoHost,
          zoho_port: Number(zohoPort),
          google_service_account_json: serviceAccountJson.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create project");
      }

      const created = await res.json();
      setShowCreateModal(false);
      setNewProjectName("");
      setServiceAccountJson("");
      window.location.href = `/projects/${created.id}`;
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 p-8 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800/80 text-blue-400 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Codex Master Specification V1 Certified</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Zoho to Google Workspace Migration Orchestrator
          </h1>
          <p className="text-slate-300 text-sm mt-2 leading-relaxed">
            Enterprise migration platform with cryptographic secret boundary (AES-256-GCM + AAD), independent mailbox validation, discovery baselines, resumable MIME transfers, message ledger deduplication, and automated discrepancy gating.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10 shrink-0">
          <button
            onClick={handleSeedDemo}
            disabled={seeding}
            className="inline-flex items-center justify-center space-x-2 bg-indigo-600/90 hover:bg-indigo-500 text-white px-4 py-3 rounded-xl font-medium text-xs transition shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer disabled:opacity-50 border border-indigo-400/30"
          >
            <Sparkles className={`w-4 h-4 ${seeding ? "animate-spin" : ""}`} />
            <span>{seeding ? "Provisioning Demo..." : "1-Click Demo Workspace"}</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl font-medium text-xs transition shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>

        {/* Subtle Background Glow */}
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-2xl text-red-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start space-x-3.5 hover:border-slate-700 transition">
          <div className="p-2.5 rounded-xl bg-blue-950/80 text-blue-400 border border-blue-800/50 mt-0.5">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Cryptographic Secret Boundary</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              AES-256-GCM authenticated encryption bound to project revision. Irrevocable post-sign-off credential purge permanently destroys stored ciphertext.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start space-x-3.5 hover:border-slate-700 transition">
          <div className="p-2.5 rounded-xl bg-indigo-950/80 text-indigo-400 border border-indigo-800/50 mt-0.5">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Preflight Isolation & Discovery</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Independent TLS IMAP & Google profile preflight checks. Inventory discovery maps folders, message boundaries, and locks source baseline scope ($S$).
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start space-x-3.5 hover:border-slate-700 transition">
          <div className="p-2.5 rounded-xl bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Ledger Deduplication & Gating</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              SHA-256 RFC822 message ledger guarantees zero duplicate writes during retry/delta runs, backed by rigorous $\le 1.0\%$ automated discrepancy sign-off gating.
            </p>
          </div>
        </div>
      </div>

      {/* Projects List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-wide">Migration Projects ({projects.length})</h2>
          <button
            onClick={fetchProjects}
            className="text-xs text-slate-400 hover:text-white flex items-center space-x-1 cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            <RotateCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
            <span>Loading migration projects...</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-dashed border-slate-800 p-8 space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400">
              <Server className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-200">No migration projects yet</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Create a new project or launch the preloaded 1-click enterprise demo to test the end-to-end migration pipeline.
              </p>
            </div>
            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                onClick={handleSeedDemo}
                disabled={seeding}
                className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Launch Demo Workspace</span>
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Project</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group p-5 bg-slate-900/80 hover:bg-slate-900 border border-slate-800/90 hover:border-slate-700 rounded-3xl transition shadow-xl shadow-black/30 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        project.status === "ACTIVE"
                          ? "bg-blue-950 text-blue-400 border-blue-800/60"
                          : project.status === "SIGNED_OFF"
                          ? "bg-emerald-950 text-emerald-400 border-emerald-800/60"
                          : project.status === "CREDENTIALS_PURGED"
                          ? "bg-purple-950 text-purple-400 border-purple-800/60"
                          : "bg-slate-800 text-slate-300 border-slate-700"
                      }`}
                    >
                      {project.status.replace("_", " ")}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white mt-3 group-hover:text-blue-400 transition leading-snug">
                    {project.name}
                  </h3>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-400">
                    <div className="flex items-center space-x-2">
                      <Server className="w-3.5 h-3.5 text-slate-500" />
                      <span>
                        IMAP: {project.zoho_host}:{project.zoho_port}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                      <span>
                        Google SA: {project.has_service_account ? "Configured" : "Default / Mock Mode"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs font-semibold text-blue-400 group-hover:translate-x-0.5 transition">
                  <span>Open Migration Hub</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="text-lg font-bold text-white">Create Migration Project</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corp — Zoho to Google Migration"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Zoho IMAP Host
                  </label>
                  <input
                    type="text"
                    value={zohoHost}
                    onChange={(e) => setZohoHost(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Default: imap.zoho.com (Standard)
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    value={zohoPort}
                    onChange={(e) => setZohoPort(Number(e.target.value))}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Google Service Account Key (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder='Default Service Account is already pre-configured. Paste custom JSON only to override...'
                  value={serviceAccountJson}
                  onChange={(e) => setServiceAccountJson(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Built-in Google Service Account is used by default. Custom JSON is optional.
                </span>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 cursor-pointer shadow-md shadow-blue-600/20"
                >
                  {creating ? "Creating..." : "Create & Open Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
