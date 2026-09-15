"use client";

import { CheckCircle2, Circle, AlertCircle, Play, Shield, RefreshCw, FileText, Lock, Compass } from "lucide-react";
import { MappingRow, ProjectRow } from "@/lib/db";

interface PipelineTrackerProps {
  project: ProjectRow;
  mappings: MappingRow[];
  onAction: (action: "UPLOAD" | "VALIDATE" | "DISCOVER" | "MIGRATE" | "RECONCILE" | "PURGE") => void;
}

export default function PipelineTracker({ project, mappings, onAction }: PipelineTrackerProps) {
  const total = mappings.length;
  const validatedReady = mappings.filter((m) => m.overall_status === "READY" || m.overall_status === "MIGRATED").length;
  const discovered = mappings.filter((m) => m.discovery_status === "DISCOVERED" || m.discovery_status === "BASELINE_REVIEWED").length;
  const reviewed = mappings.filter((m) => m.discovery_status === "BASELINE_REVIEWED").length;
  const migrated = mappings.filter((m) => m.overall_status === "MIGRATED").length;
  const isSignedOff = project.status === "SIGNED_OFF" || project.status === "CREDENTIALS_PURGED";
  const isPurged = project.status === "CREDENTIALS_PURGED";

  const steps = [
    {
      id: "upload",
      number: 1,
      title: "CSV Onboarding",
      desc: total > 0 ? `${total} mailboxes mapped` : "Upload migration CSV",
      status: total > 0 ? "completed" : "active",
      action: () => onAction("UPLOAD"),
      actionLabel: "Upload CSV",
    },
    {
      id: "validate",
      number: 2,
      title: "Preflight Check",
      desc: `${validatedReady}/${total} verified ready`,
      status: total === 0 ? "pending" : validatedReady === total ? "completed" : "active",
      action: () => onAction("VALIDATE"),
      actionLabel: "Validate All",
    },
    {
      id: "discover",
      number: 3,
      title: "Inventory Discovery",
      desc: `${discovered}/${total} mailboxes scanned`,
      status: validatedReady === 0 ? "pending" : discovered === total ? "completed" : "active",
      action: () => onAction("DISCOVER"),
      actionLabel: "Discover",
    },
    {
      id: "review",
      number: 4,
      title: "Baseline Lock",
      desc: `${reviewed}/${total} scopes reviewed`,
      status: discovered === 0 ? "pending" : reviewed === total ? "completed" : "active",
      action: () => onAction("DISCOVER"),
      actionLabel: "Review Scopes",
    },
    {
      id: "migrate",
      number: 5,
      title: "MIME Migration",
      desc: `${migrated}/${total} mailboxes migrated`,
      status: reviewed === 0 ? "pending" : migrated === total ? "completed" : "active",
      action: () => onAction("MIGRATE"),
      actionLabel: "Migrate",
    },
    {
      id: "reconcile",
      number: 6,
      title: "Reconcile & Sign-Off",
      desc: isSignedOff ? "Signed off by operator" : "Evaluate discrepancy",
      status: migrated === 0 ? "pending" : isSignedOff ? "completed" : "active",
      action: () => onAction("RECONCILE"),
      actionLabel: "Reconcile",
    },
    {
      id: "purge",
      number: 7,
      title: "Credential Purge",
      desc: isPurged ? "Secrets destroyed" : "Cryptographic purge",
      status: !isSignedOff ? "pending" : isPurged ? "completed" : "active",
      action: () => onAction("PURGE"),
      actionLabel: "Purge",
    },
  ];

  return (
    <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide uppercase flex items-center space-x-2">
            <span>Migration Pipeline Lifecycle</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Sequential workflow governance from CSV onboarding through cryptographic credential purge.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-400">Project Stage:</span>
          <span className="px-2.5 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-800 font-semibold">
            {isPurged
              ? "Completed & Purged"
              : isSignedOff
              ? "Signed Off"
              : migrated > 0
              ? "Migration in Progress"
              : reviewed > 0
              ? "Baseline Locked"
              : discovered > 0
              ? "Discovered"
              : validatedReady > 0
              ? "Preflight Verified"
              : total > 0
              ? "Onboarded"
              : "Draft"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {steps.map((step, idx) => {
          const isCompleted = step.status === "completed";
          const isActive = step.status === "active";

          return (
            <div
              key={step.id}
              className={`relative p-3 rounded-xl border transition flex flex-col justify-between ${
                isCompleted
                  ? "bg-emerald-950/20 border-emerald-900/60 text-emerald-300"
                  : isActive
                  ? "bg-blue-950/30 border-blue-800/80 text-blue-200 ring-1 ring-blue-500/30 shadow-lg shadow-blue-950/50"
                  : "bg-slate-950/40 border-slate-800/60 text-slate-500 opacity-70"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      isCompleted
                        ? "bg-emerald-500 text-slate-950"
                        : isActive
                        ? "bg-blue-500 text-white"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {isCompleted ? "✓" : step.number}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider">
                    {isCompleted ? "Done" : isActive ? "Active" : "Wait"}
                  </span>
                </div>

                <h3 className="text-xs font-semibold text-white leading-tight">{step.title}</h3>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">{step.desc}</p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/60">
                <button
                  onClick={step.action}
                  className={`w-full py-1 px-2 rounded-lg text-[10px] font-semibold transition flex items-center justify-center space-x-1 cursor-pointer ${
                    isActive
                      ? "bg-blue-600 hover:bg-blue-500 text-white shadow"
                      : isCompleted
                      ? "bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800/50"
                      : "bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span>{step.actionLabel}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
