"use client";

import Link from "next/link";
import { MailCheck, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type QueueRow = {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  status: string;
  confidence: string;
  fileName: string;
};

function statusLabel(status: string) {
  if (status === "reviewed" || status === "extracted") return "Needs Review";
  if (status === "archived" || status === "approved") return "Approved";
  if (status.includes("failed")) return "Failed";
  return status;
}

export default function EmailInvoiceInboxClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const refreshQueue = useCallback(async () => {
    setLoading(true);
    try {
      const [inboxRes, reviewRes] = await Promise.all([
        fetch("/api/documents?view=inbox").then((r) => r.json()),
        fetch("/api/documents?view=needs-review").then((r) => r.json()),
      ]);
      const rows = [...(inboxRes.documents || []), ...(reviewRes.documents || [])];
      const mapped: QueueRow[] = rows.map((doc: Record<string, unknown>) => ({
        id: String(doc.storageDocumentId || doc.id || ""),
        supplierName: String(doc.supplier || doc.supplierName || doc.supplier_name || "Unknown supplier"),
        invoiceNumber: String(doc.displayId || doc.invoiceNumber || doc.invoice_number || "—"),
        status: String(doc.dbStatus || doc.status || "uploaded"),
        confidence: doc.confidence != null ? `${Number(doc.confidence)}%` : "—",
        fileName: String(doc.fileName || doc.original_filename || doc.displayId || "invoice"),
      }));
      setQueue(mapped);
    } catch {
      setMessage("Could not load email intake queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  async function handleUpload(file: File) {
    setUploading(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("__client_file_size", String(file.size));
      formData.append("__client_file_last_modified", String(file.lastModified || 0));
      formData.append("__client_file_name", file.name);
      formData.append("__client_file_mime", file.type || "application/octet-stream");
      const response = await fetch("/api/documents/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Upload failed.");
      setMessage(`Uploaded ${file.name}. Opening review…`);
      const documentId = String(data.documentId || data.id || "");
      if (documentId) {
        const extractRes = await fetch(`/api/documents/${documentId}/extract`, { method: "POST" });
        const extractData = await extractRes.json().catch(() => ({}));
        if (!extractData.ok && !extractData.partial) {
          console.warn("[EmailInvoiceInbox] extraction failed — opening manual review", extractData);
          setMessage(
            extractData.error
              ? `Uploaded. AI extraction failed — open review to capture manually. (${extractData.error})`
              : "Uploaded. Open review to capture fields manually."
          );
        }
        router.push(`/document-intelligence/${documentId}`);
        return;
      }
      await refreshQueue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] border border-violet-100 bg-gradient-to-br from-violet-700 to-fuchsia-800 p-6 text-white shadow-[0_18px_55px_rgba(29,107,255,0.24)]">
        <MailCheck size={34} className="text-fuchsia-200" />
        <h2 className="mt-5 text-3xl font-black">Email Invoice Inbox</h2>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-violet-100">
          Supplier invoices emailed to VYRON COST are queued here. Upload attachments to run extraction, supplier
          matching, and approval in Document Intelligence.
        </p>
        <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white">invoices@vyroncost.co.za</div>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-violet-800 disabled:opacity-60"
        >
          <UploadCloud size={17} />
          {uploading ? "Uploading…" : "Upload email attachment"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleUpload(file);
            event.target.value = "";
          }}
        />
        {message ? <div className="mt-3 text-sm font-black text-fuchsia-200">{message}</div> : null}
        <Link href="/document-intelligence" className="mt-4 inline-block text-xs font-black uppercase text-fuchsia-200 hover:underline">
          Open Document Intelligence hub →
        </Link>
      </div>

      <div className="overflow-x-auto rounded-[2rem] border border-violet-100 bg-white shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="min-w-[720px]">
        <div className="grid grid-cols-5 bg-violet-800 px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-violet-100">
          <div>Source</div>
          <div>File</div>
          <div>Supplier</div>
          <div>Status</div>
          <div>Confidence</div>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-sm font-bold text-slate-500">Loading live queue…</div>
        ) : queue.length === 0 ? (
          <div className="px-5 py-8 text-sm font-bold text-slate-500">
            No invoices in the intake queue. Upload a PDF or capture from{" "}
            <Link href="/document-intelligence" className="text-violet-700 underline">
              Document Intelligence
            </Link>
            .
          </div>
        ) : (
          queue.map((row) => (
            <Link
              key={row.id}
              href={`/document-intelligence/${row.id}`}
              className="grid grid-cols-5 items-center border-t border-slate-100 px-5 py-5 text-sm transition hover:bg-violet-50/60"
            >
              <div className="font-bold text-slate-600">invoices@vyroncost.co.za</div>
              <div className="font-black text-slate-950">{row.fileName}</div>
              <div>{row.supplierName}</div>
              <div className="font-black text-violet-700">{statusLabel(row.status)}</div>
              <div>{row.confidence}</div>
            </Link>
          ))
        )}
        </div>
      </div>
    </section>
  );
}
