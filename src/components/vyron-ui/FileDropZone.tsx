"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

/** Drag a file here, or click to choose one. Calls onFile once per chosen file. */
export default function FileDropZone({
  accept = ".csv,.xlsx",
  label = "Drag & drop a CSV or Excel file here",
  hint = "or click to choose a file (max 5 MB)",
  disabled = false,
  onFile,
}: {
  accept?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file && !disabled) onFile(file);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) input.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${
        over ? "border-[#E8B83F] bg-amber-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <Upload size={28} className="text-slate-500" />
      <span className="text-sm font-black text-slate-800">{label}</span>
      <span className="text-xs font-semibold text-slate-500">{hint}</span>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
