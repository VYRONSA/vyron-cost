"use client";

import { useState } from "react";
import { Download, Mail, Printer, Eye, Loader2 } from "lucide-react";

export type DocumentPdfActionsProps = {
  pdfUrl: string;
  emailUrl?: string;
  fileName: string;
  defaultRecipient?: string;
  className?: string;
};

async function fetchPdfBlob(pdfUrl: string) {
  const response = await fetch(pdfUrl, { cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Could not generate PDF.");
  }
  return response.blob();
}

/**
 * Shared VYRON platform document toolbar — Print / Preview / Download / Email PDF,
 * backed by the real document PDF engine (not a browser screenshot).
 */
export function DocumentPdfActions({ pdfUrl, emailUrl, fileName, defaultRecipient, className }: DocumentPdfActionsProps) {
  const [busy, setBusy] = useState<"print" | "preview" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [recipient, setRecipient] = useState(defaultRecipient || "");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  async function withBlob(action: "print" | "preview" | "download") {
    setBusy(action);
    setError(null);
    try {
      const blob = await fetchPdfBlob(pdfUrl);
      const url = URL.createObjectURL(blob);
      if (action === "download") {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
      } else {
        const win = window.open(url, "_blank");
        if (action === "print" && win) {
          win.addEventListener("load", () => win.print());
        }
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function sendEmail() {
    if (!emailUrl || !recipient.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const response = await fetch(emailUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: recipient.trim() }),
      });
      const data = await response.json();
      setSendResult(data.ok ? `Sent to ${recipient.trim()}.` : data.error || "Send failed.");
    } catch (err) {
      setSendResult(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`relative inline-flex flex-wrap items-center gap-2 ${className || ""}`}>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void withBlob("preview")}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        Preview
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void withBlob("print")}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {busy === "print" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
        Print
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void withBlob("download")}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {busy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Download PDF
      </button>
      {emailUrl ? (
        <button
          type="button"
          onClick={() => setEmailOpen((open) => !open)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-800"
        >
          <Mail className="h-3.5 w-3.5" />
          Email PDF
        </button>
      ) : null}

      {error ? <span className="text-xs font-bold text-rose-600">{error}</span> : null}

      {emailOpen && emailUrl ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
            Recipient Email
            <input
              type="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="name@example.com"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-slate-400"
            />
          </label>
          <button
            type="button"
            disabled={sending || !recipient.trim()}
            onClick={() => void sendEmail()}
            className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
          {sendResult ? <p className="mt-2 text-xs font-bold text-slate-600">{sendResult}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
