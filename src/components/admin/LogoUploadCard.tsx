"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ImageOff, Loader2, Trash2, UploadCloud } from "lucide-react";
import type { CompanyBranding } from "@/lib/platform/branding";

const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
const ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".svg"];
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export type LogoToast = { type: "success" | "error"; message: string };

function isAcceptedFile(file: File) {
  if (ACCEPTED_MIME.includes(file.type)) return true;
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Uploads via XHR (not fetch) so real byte-level upload progress events are available. */
function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<{ status: number; data: { ok: boolean; branding?: CompanyBranding; error?: string; svgRasterized?: boolean } }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      try {
        resolve({ status: xhr.status, data: JSON.parse(xhr.responseText) });
      } catch {
        reject(new Error("Unexpected response from server."));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(formData);
  });
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

export default function LogoUploadCard({
  branding,
  canEdit,
  onBrandingChange,
  onToast,
}: {
  branding: CompanyBranding;
  canEdit: boolean;
  onBrandingChange: (branding: CompanyBranding) => void;
  onToast: (toast: LogoToast) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const logoPreview = useMemo(() => branding.logoDataUrl || branding.logoUrl, [branding.logoDataUrl, branding.logoUrl]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!canEdit) {
        onToast({ type: "error", message: "You do not have permission to edit company branding." });
        return;
      }
      if (!isAcceptedFile(file)) {
        onToast({ type: "error", message: "Only PNG, JPG and SVG files are supported." });
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        onToast({ type: "error", message: `Logo file exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} upload limit.` });
        return;
      }

      setUploading(true);
      setProgress(0);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const { data } = await uploadWithProgress("/api/workspace/admin/company/branding/logo", formData, setProgress);
        if (!data.ok || !data.branding) {
          onToast({ type: "error", message: data.error || "Logo upload failed." });
          return;
        }
        onBrandingChange(data.branding);
        onToast({
          type: "success",
          message:
            data.svgRasterized === false
              ? "Logo uploaded. Note: SVG could not be converted for PDF embedding in this environment — PNG/JPG is recommended."
              : "Logo uploaded successfully.",
        });
      } catch (error) {
        onToast({ type: "error", message: error instanceof Error ? error.message : "Logo upload failed." });
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [canEdit, onBrandingChange, onToast]
  );

  const removeLogo = useCallback(async () => {
    if (!canEdit) {
      onToast({ type: "error", message: "You do not have permission to edit company branding." });
      return;
    }
    setRemoving(true);
    try {
      const response = await fetch("/api/workspace/admin/company/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: null }),
      });
      const data = await response.json();
      if (!data.ok) {
        onToast({ type: "error", message: data.error || "Failed to remove logo." });
        return;
      }
      onBrandingChange(data.branding as CompanyBranding);
      onToast({ type: "success", message: "Logo removed." });
    } catch (error) {
      onToast({ type: "error", message: error instanceof Error ? error.message : "Failed to remove logo." });
    } finally {
      setRemoving(false);
    }
  }, [canEdit, onBrandingChange, onToast]);

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void uploadFile(file);
    event.target.value = "";
  }

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!canEdit) return;
    dragCounter.current += 1;
    setDragActive(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragActive(false);
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = 0;
    setDragActive(false);
    if (!canEdit) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  const busy = uploading || removing;

  return (
    <div className="md:col-span-2">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Company Logo</span>

      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative mt-2 flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragActive
            ? "border-violet-400 bg-violet-50"
            : "border-violet-100 bg-violet-50/40 hover:border-violet-300 hover:bg-violet-50/70"
        } ${!canEdit ? "opacity-60" : ""}`}
      >
        {logoPreview ? (
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoPreview} alt="Company logo" className="max-h-20 max-w-20 object-contain" />
          </div>
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-white text-violet-300">
            <ImageOff size={28} />
          </div>
        )}

        <div>
          <div className="flex items-center justify-center gap-2 text-sm font-black text-slate-900">
            <UploadCloud size={18} className="text-violet-600" />
            {dragActive ? "Drop to upload" : "Drag & drop your logo here"}
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">PNG, JPG or SVG · up to {formatBytes(MAX_UPLOAD_BYTES)}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            {uploading ? `Uploading… ${progress}%` : logoPreview ? "Replace Logo" : "Choose File"}
          </button>
          {logoPreview ? (
            <button
              type="button"
              disabled={!canEdit || busy}
              onClick={() => void removeLogo()}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-black text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
            >
              {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {removing ? "Removing…" : "Remove Logo"}
            </button>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MIME.join(",")}
          className="hidden"
          disabled={!canEdit || busy}
          onChange={handleFileInputChange}
        />

        {uploading ? (
          <div className="w-full max-w-xs">
            <div className="h-2 w-full overflow-hidden rounded-full bg-violet-100">
              <div
                className="h-full rounded-full bg-violet-600 transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
