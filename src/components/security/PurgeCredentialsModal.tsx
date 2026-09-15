"use client";

import { useState } from "react";
import { Lock, AlertTriangle, ShieldCheck, Trash2, CheckCircle2 } from "lucide-react";

interface PurgeCredentialsModalProps {
  projectId: string;
  projectName: string;
  selectedMappingIds?: string[];
  onClose: () => void;
  onPurgeComplete: () => void;
}

export default function PurgeCredentialsModal({
  projectId,
  projectName,
  selectedMappingIds,
  onClose,
  onPurgeComplete,
}: PurgeCredentialsModalProps) {
  const [operatorName, setOperatorName] = useState("Security Administrator");
  const [confirmed, setConfirmed] = useState(false);
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const handlePurge = async () => {
    if (!confirmed || !operatorName.trim()) return;

    setPurging(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorName,
          mappingIds: selectedMappingIds && selectedMappingIds.length > 0 ? selectedMappingIds : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to execute credential purge");
      }

      const data = await res.json();
      setResult(data.result);
      onPurgeComplete();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-purple-950 text-purple-400 border border-purple-800/60">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Cryptographic Credential Purge</h3>
              <p className="text-xs text-slate-400">{projectName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs cursor-pointer">
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {result ? (
          <div className="space-y-4 py-2">
            <div className="p-4 bg-purple-950/40 border border-purple-800/80 rounded-2xl text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-purple-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Credentials Purged Successfully</h4>
              <p className="text-xs text-purple-300">
                {result.purgedSecretsCount} encrypted source credentials permanently destroyed.
              </p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400 space-y-1">
              <div>
                <strong>Audited Operator:</strong> {result.actor}
              </div>
              <div>
                <strong>Purge Timestamp:</strong> {new Date(result.purgedAt).toLocaleString()}
              </div>
              <div>
                <strong>Retained Metadata:</strong> Discovery baselines, message ledgers, and reconciliation reports remain intact for audit compliance.
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-medium transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-purple-950/30 border border-purple-900/50 rounded-2xl space-y-2 text-purple-200">
              <span className="font-semibold block flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span>Zero-Trust Credential Destruction</span>
              </span>
              <p className="text-slate-300 text-[11px]">
                Purging destroys all encrypted source credentials stored in the secrets table. This operation cannot be reversed.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block uppercase font-semibold text-slate-400 text-[10px]">
                Authorizing Security Operator *
              </label>
              <input
                type="text"
                required
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-start space-x-2.5">
              <input
                type="checkbox"
                id="confirmPurge"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="confirmPurge" className="text-slate-300 text-[11px] cursor-pointer">
                I understand this will permanently delete all stored source passwords for{" "}
                {selectedMappingIds?.length ? `${selectedMappingIds.length} selected mailbox(es)` : "all mailboxes in this project"} while keeping migration audit history.
              </label>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurge}
                disabled={!confirmed || !operatorName.trim() || purging}
                className="inline-flex items-center space-x-1.5 bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl font-medium transition cursor-pointer shadow-lg shadow-purple-600/20 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{purging ? "Purging..." : "Permanently Purge Credentials"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
