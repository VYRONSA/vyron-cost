"use client";

import { useRef, useState } from "react";
import { CloudUpload, FileSpreadsheet, Loader2, X } from "lucide-react";

export const STOCK_TAKE_ACCEPT = ".xlsx,.xls,.csv";

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The Stock Take upload area: drag and drop a file onto it, or Browse Files (the normal file picker,
 * which is what mobile devices use). Shows the chosen file with its size, a reading state, and
 * Replace / Remove before anything is confirmed.
 */
export default function StockTakeDropZone({
  file,
  busy,
  onFile,
  onRemove,
}: {
  file: File | null;
  busy: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const browse = () => {
    if (!busy) input.current?.click();
  };
  const take = (files: FileList | null) => {
    const chosen = files?.[0];
    if (chosen && !busy) onFile(chosen);
  };

  return (
    <div
      data-testid="stock-take-dropzone"
      onDragEnter={(e) => {
        e.preventDefault();
        if (!busy) setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = busy ? "none" : "copy";
        if (!busy) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={`flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-4 py-8 text-center transition sm:px-6 sm:py-10 ${
        over ? "border-[#E8B83F] bg-amber-50" : "border-slate-300 bg-slate-50 hover:border-slate-400"
      }`}
    >
      {busy ? <Loader2 size={40} className="animate-spin text-slate-500" aria-hidden /> : <CloudUpload size={44} className={over ? "text-amber-600" : "text-slate-500"} aria-hidden />}
      <p className="text-base font-black text-slate-900">{busy ? "Reading and validating your file…" : over ? "Drop the file to upload it" : "Drag and drop your stock-take file here"}</p>
      {!busy ? (
        <>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">or</p>
          <button
            type="button"
            onClick={browse}
            className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-black text-white shadow-sm hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8B83F]"
          >
            Browse Files
          </button>
        </>
      ) : null}
      <p className="text-xs font-semibold text-slate-600">You can drag and drop your completed stock-take file here.</p>
      <p className="text-xs font-semibold text-slate-500">Supported formats: .xlsx, .xls, .csv (max 5 MB). With or without a header row.</p>

      {file ? (
        <div className="mt-2 flex w-full max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left">
          <FileSpreadsheet size={22} className="shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-slate-900" data-testid="stock-take-file-name">
              {file.name}
            </p>
            <p className="text-xs font-semibold text-slate-500" data-testid="stock-take-file-size">
              {fileSize(file.size)}
            </p>
          </div>
          <button type="button" disabled={busy} onClick={browse} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Replace
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            aria-label="Remove file"
            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            <X size={14} aria-hidden /> Remove
          </button>
        </div>
      ) : null}

      <input
        ref={input}
        type="file"
        accept={STOCK_TAKE_ACCEPT}
        className="hidden"
        data-testid="stock-take-file-input"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
