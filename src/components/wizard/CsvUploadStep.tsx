"use client";

import { useState, useRef } from "react";
import { Upload, FileText, Download, AlertCircle, CheckCircle } from "lucide-react";

interface CsvUploadStepProps {
  projectId: string;
  onUploadSuccess: (csvText: string, detection: any, hasHeader: boolean) => void;
}

export default function CsvUploadStep({ projectId, onUploadSuccess }: CsvUploadStepProps) {
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileProcess = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setError("Please upload a standard CSV file (.csv)");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("File exceeds maximum allowed upload size of 10MB");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const text = await file.text();
      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent: text, action: "detect" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to parse CSV file");
      }

      const data = await res.json();
      onUploadSuccess(text, data.detection, data.hasHeaderRow);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto py-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-white tracking-tight">Upload Migration Map CSV</h2>
        <p className="text-sm text-slate-400">
          Upload your customer mailbox mapping file containing Zoho source accounts and Google Workspace destinations.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer ${
          dragOver
            ? "border-blue-500 bg-blue-950/20"
            : "border-slate-800 hover:border-slate-700 bg-slate-900/40"
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept=".csv,text/csv"
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-blue-400 mb-3 shadow-inner">
          <Upload className="w-6 h-6" />
        </div>

        <p className="text-sm font-semibold text-slate-200">
          {loading ? "Analyzing CSV structure..." : "Drag and drop your CSV file here"}
        </p>
        <p className="text-xs text-slate-500 mt-1">or click to browse from your device</p>

        <div className="mt-4 inline-flex items-center space-x-2 text-[11px] text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60">
          <FileText className="w-3.5 h-3.5 text-slate-400" />
          <span>UTF-8 supported · Max 10MB · Up to 10,000 rows</span>
        </div>
      </div>

      {/* Template & Guidelines */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-400">
        <div className="space-y-1">
          <span className="font-semibold text-slate-200 block">Need the standard format?</span>
          <span>Download canonical 3-column template without sample credentials.</span>
        </div>

        <a
          href={`/api/projects/${projectId}/template`}
          download="migration-map-template.csv"
          className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-3 py-2 rounded-lg border border-slate-700 font-medium transition shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-blue-400" />
          <span>Download Template CSV</span>
        </a>
      </div>

      <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-900/30 text-xs text-slate-400 space-y-1">
        <span className="font-semibold text-blue-300 flex items-center space-x-1.5">
          <CheckCircle className="w-3.5 h-3.5 text-blue-400" />
          <span>Security & Ingestion Safeguards</span>
        </span>
        <p>
          Credentials are parsed strictly in short-lived memory, encrypted with AES-256-GCM, and stored isolated from mappings. Plaintext secrets are never persisted, logged, or exposed.
        </p>
      </div>
    </div>
  );
}
