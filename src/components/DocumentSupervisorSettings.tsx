"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { DocumentApprovalRules } from "@/lib/vyron-document-approval-rules";

export default function DocumentSupervisorSettings() {
  const [rules, setRules] = useState<DocumentApprovalRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/documents/approval-rules");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not load settings.");
      setRules(data.rules as DocumentApprovalRules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!rules) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/documents/approval-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Save failed.");
      setRules(data.rules as DocumentApprovalRules);
      setMessage("Supervisor settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm font-bold text-slate-500">
        <Loader2 className="animate-spin" size={18} />
        Loading supervisor settings…
      </div>
    );
  }

  if (!rules) {
    return <p className="text-sm font-semibold text-rose-700">{error || "Settings unavailable."}</p>;
  }

  const toggles: Array<{ key: keyof DocumentApprovalRules; label: string }> = [
    { key: "requirePurchaseOrder", label: "Require purchase order before approval" },
    { key: "requireSupplier", label: "Require supplier" },
    { key: "requireInvoiceNumber", label: "Require invoice number" },
    { key: "requireInvoiceDate", label: "Require invoice date" },
    { key: "requireVat", label: "Require VAT" },
    { key: "requireMatchedLineItems", label: "Require matched line items" },
    { key: "allowIgnoredLines", label: "Allow ignored lines" },
    { key: "allowRoundingDifference", label: "Allow rounding difference" },
    { key: "supervisorOverrideRequiredAboveVariance", label: "Supervisor override required above variance limit" },
    { key: "blockUnmappedLines", label: "Block unmapped lines (legacy sync)" },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href="/document-intelligence"
          className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-violet-700"
        >
          <ArrowLeft size={14} />
          Document Intelligence
        </Link>
        <h2 className="text-2xl font-black text-slate-950">Supervisor settings</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Company approval policy for invoice review. Override PIN defaults to <code className="text-xs">vyron-supervisor</code>{" "}
          (set <code className="text-xs">VYRON_DOCUMENT_SUPERVISOR_PIN</code> in env).
        </p>
      </div>

      {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800">{error}</p> : null}

      <section className="rounded-[2rem] border border-violet-100 bg-white p-6 space-y-4">
        <h3 className="text-sm font-black uppercase text-slate-500">Required fields & lines</h3>
        {toggles.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-3 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(rules[key])}
              onChange={(e) => setRules({ ...rules, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </section>

      <section className="rounded-[2rem] border border-violet-100 bg-white p-6 grid gap-4">
        <h3 className="text-sm font-black uppercase text-slate-500">Thresholds</h3>
        {(
          [
            ["minHeaderConfidence", "Min header confidence %", 1],
            ["maxAllowedVariancePercent", "Maximum allowed variance %", 0.1],
            ["roundingTolerance", "Rounding tolerance (R)", 0.01],
            ["majorMismatchThreshold", "Major mismatch threshold (R)", 0.01],
            ["maxManualOverridesBeforeAlert", "Max manual overrides before alert", 1],
          ] as const
        ).map(([key, label, step]) => (
          <label key={key} className="grid gap-1 text-xs font-black uppercase text-slate-500">
            {label}
            <input
              type="number"
              step={step}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
              value={rules[key]}
              onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </section>

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="rounded-xl bg-violet-700 px-6 py-3 text-sm font-black text-white disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save supervisor settings"}
      </button>
    </div>
  );
}
