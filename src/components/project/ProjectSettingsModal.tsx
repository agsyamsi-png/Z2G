"use client";

import { useState } from "react";
import { Settings, Server, Key, AlertCircle, CheckCircle2, ShieldCheck, X } from "lucide-react";

interface ProjectSettingsModalProps {
  projectId: string;
  initialName: string;
  initialZohoHost: string;
  initialZohoPort: number;
  hasServiceAccount: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProjectSettingsModal({
  projectId,
  initialName,
  initialZohoHost,
  initialZohoPort,
  hasServiceAccount,
  onClose,
  onSuccess,
}: ProjectSettingsModalProps) {
  const [name, setName] = useState(initialName);
  const [zohoHost, setZohoHost] = useState(initialZohoHost || "imap.zoho.com");
  const [zohoPort, setZohoPort] = useState(initialZohoPort || 993);
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [showReplaceKey, setShowReplaceKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload: any = {
        name,
        zoho_host: zohoHost,
        zoho_port: Number(zohoPort),
      };

      if (serviceAccountJson.trim()) {
        try {
          JSON.parse(serviceAccountJson);
          payload.google_service_account_json = serviceAccountJson.trim();
        } catch {
          throw new Error("Invalid Google Service Account JSON syntax");
        }
      }

      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update project settings");
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-blue-950 text-blue-400 border border-blue-800/60">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Project Infrastructure Settings</h3>
              <p className="text-xs text-slate-400">Configure Zoho IMAP endpoint and Google Workspace API credentials</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-300">Zoho IMAP Host</label>
              <input
                type="text"
                value={zohoHost}
                onChange={(e) => setZohoHost(e.target.value)}
                placeholder="imap.zoho.com"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
              <p className="text-[10px] text-slate-500">
                Default: imap.zoho.com (Standard) · imappro.zoho.com · imap.zoho.eu
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Port (TLS)</label>
              <input
                type="number"
                value={zohoPort}
                onChange={(e) => setZohoPort(Number(e.target.value))}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Google Workspace Service Account</span>
            </label>

            {hasServiceAccount && (
              <div className="p-3 bg-emerald-950/30 border border-emerald-800/60 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Active & Configured</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReplaceKey(!showReplaceKey)}
                    className="text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                  >
                    {showReplaceKey ? "Keep Existing Key" : "Replace Key..."}
                  </button>
                </div>
                <div className="text-[11px] text-slate-300 font-mono space-y-1 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Project ID:</span>
                    <span className="text-white">silicon-webbing-507206-p3</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Client ID:</span>
                    <span className="text-white">107205362313237636600</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Service Email:</span>
                    <span className="text-emerald-300 truncate max-w-[280px]">zoho-migration-tool@silicon-webbing-507206-p3...</span>
                  </div>
                </div>
              </div>
            )}

            {(!hasServiceAccount || showReplaceKey) && (
              <div className="space-y-1 pt-1">
                <textarea
                  value={serviceAccountJson}
                  onChange={(e) => setServiceAccountJson(e.target.value)}
                  placeholder='Paste Google Service Account JSON key here...'
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 leading-relaxed resize-none"
                />
                <p className="text-[10px] text-slate-500">
                  Requires Domain-Wide Delegation with Gmail API scopes.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow-lg shadow-blue-600/20 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
