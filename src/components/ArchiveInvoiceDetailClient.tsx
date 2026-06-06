"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import InvoiceDocumentViewer from "@/components/InvoiceDocumentViewer";
import { fetchDocumentPreview } from "@/lib/vyron-document-review-client";
import { priceMovementClass, priceMovementLabel, type PriceMovement } from "@/lib/vyron-price-history";

type ArchiveDetail = {
  document: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  costAudit: Array<Record<string, unknown>>;
  priceHistory: Array<Record<string, unknown>>;
  approvalAudit: Array<Record<string, unknown>>;
  fieldCorrections: Array<Record<string, unknown>>;
  rollbacks: Array<Record<string, unknown>>;
  overrideAudit: Array<Record<string, unknown>>;
  extractionLogs: Array<Record<string, unknown>>;
  riskAlerts: Array<Record<string, unknown>>;
};

export default function ArchiveInvoiceDetailClient({ documentId }: { documentId: string }) {
  const [detail, setDetail] = useState<ArchiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [supervisorPin, setSupervisorPin] = useState("");
  const [rollbackNotes, setRollbackNotes] = useState("");
  const [rollingBack, setRollingBack] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [archiveRes, preview] = await Promise.all([
        fetch(`/api/documents/${documentId}/archive`).then((r) => r.json()),
        fetchDocumentPreview(documentId).catch(() => null),
      ]);
      if (!archiveRes.ok) throw new Error(archiveRes.error || "Could not load archive.");
      setDetail({
        document: archiveRes.document,
        lines: archiveRes.lines || [],
        costAudit: archiveRes.costAudit || [],
        priceHistory: archiveRes.priceHistory || [],
        approvalAudit: archiveRes.approvalAudit || [],
        fieldCorrections: archiveRes.fieldCorrections || [],
        rollbacks: archiveRes.rollbacks || [],
        overrideAudit: archiveRes.overrideAudit || [],
        extractionLogs: archiveRes.extractionLogs || [],
        riskAlerts: archiveRes.riskAlerts || [],
      });
      if (preview) {
        setPreviewUrl(preview.previewUrl);
        setPreviewMime(preview.fileMime);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load archived invoice.");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRollback() {
    setRollingBack(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch(`/api/documents/${documentId}/rollback-cost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisorPin, notes: rollbackNotes, rolledBackBy: "supervisor" }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Rollback failed.");
      setMessage(json.message || "Cost update rolled back.");
      setRollbackOpen(false);
      setSupervisorPin("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed.");
    } finally {
      setRollingBack(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm font-bold text-slate-500">
        <Loader2 className="animate-spin" size={18} />
        Loading archived invoice…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link href="/document-intelligence" className="text-xs font-black uppercase text-violet-700">
          ← Document Intelligence
        </Link>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error || "Archive not found."}
        </p>
      </div>
    );
  }

  const doc = detail.document;
  const approval = detail.approvalAudit[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/document-intelligence"
            className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-violet-700"
          >
            <ArrowLeft size={14} />
            Invoice Archive
          </Link>
          <h2 className="text-2xl font-black text-slate-950">
            {String(doc.invoice_number || "Invoice")} · {String(doc.supplier_name || "Supplier")}
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Read-only archive · Approved {String(doc.approved_at || "").slice(0, 16) || "—"} by{" "}
            {String(doc.approved_by || approval?.approved_by || "—")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRollbackOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-black uppercase text-amber-900"
        >
          <RotateCcw size={14} />
          Rollback cost update
        </button>
      </div>

      {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[2rem] border border-violet-100 bg-white p-4 min-h-[420px]">
          <h3 className="mb-3 text-sm font-black uppercase text-slate-500">Original invoice preview</h3>
          {previewUrl ? (
            <InvoiceDocumentViewer url={previewUrl} mimeType={previewMime || "application/pdf"} />
          ) : (
            <p className="text-sm font-semibold text-slate-500">Preview unavailable.</p>
          )}
        </section>

        <section className="rounded-[2rem] border border-violet-100 bg-white p-5 space-y-4">
          <h3 className="text-sm font-black uppercase text-slate-500">Approved header values</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {(
              [
                ["Invoice #", doc.invoice_number],
                ["Invoice date", doc.invoice_date],
                ["Supplier VAT", doc.supplier_vat_number],
                ["Subtotal", doc.subtotal],
                ["VAT", doc.vat],
                ["Total", doc.total],
                ["Currency", doc.currency],
                ["PO", doc.purchase_order_number],
              ] as Array<[string, unknown]>
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-[10px] font-black uppercase text-slate-400">{label}</dt>
                <dd className="font-bold text-slate-900">{value !== null && value !== undefined ? String(value) : "—"}</dd>
              </div>
            ))}
          </dl>
          {doc.processing_notes ? (
            <p className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">
              {String(doc.processing_notes)}
            </p>
          ) : null}
        </section>
      </div>

      <section className="rounded-[2rem] border border-violet-100 bg-white p-5 overflow-x-auto">
        <h3 className="text-sm font-black uppercase text-slate-500">Line allocations</h3>
        <table className="mt-3 min-w-[900px] w-full text-left text-sm">
          <thead className="text-[10px] font-black uppercase text-slate-500">
            <tr>
              <th className="py-2">Description</th>
              <th className="py-2">Qty</th>
              <th className="py-2">Unit</th>
              <th className="py-2">Price</th>
              <th className="py-2">Matched to</th>
              <th className="py-2">Type</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((line) => (
              <tr key={String(line.id)} className={`border-t ${line.ignored ? "opacity-50" : ""}`}>
                <td className="py-2 font-semibold">{String(line.description || "")}</td>
                <td className="py-2">{String(line.quantity ?? "—")}</td>
                <td className="py-2">{String(line.unit || "—")}</td>
                <td className="py-2 font-black">R{Number(line.unit_price || 0).toFixed(2)}</td>
                <td className="py-2">{String(line.matched_entity_name || "—")}</td>
                <td className="py-2">{String(line.matched_entity_type || "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[2rem] border border-violet-100 bg-white p-5 overflow-x-auto">
          <h3 className="text-sm font-black uppercase text-slate-500">Cost updates</h3>
          <table className="mt-3 min-w-full text-left text-xs">
            <thead className="font-black uppercase text-slate-500">
              <tr>
                <th className="py-1">Item</th>
                <th className="py-1">Previous</th>
                <th className="py-1">New</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.costAudit.map((row) => (
                <tr key={String(row.id)} className="border-t">
                  <td className="py-2 font-bold">{String(row.entity_name)}</td>
                  <td className="py-2">R{Number(row.previous_cost || 0).toFixed(2)}</td>
                  <td className="py-2">R{Number(row.new_cost || 0).toFixed(2)}</td>
                  <td className="py-2">{row.rolled_back_at ? "Rolled back" : "Applied"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-[2rem] border border-violet-100 bg-white p-5 overflow-x-auto">
          <h3 className="text-sm font-black uppercase text-slate-500">Price history updates</h3>
          <table className="mt-3 min-w-full text-left text-xs">
            <thead className="font-black uppercase text-slate-500">
              <tr>
                <th className="py-1">Item</th>
                <th className="py-1">Previous</th>
                <th className="py-1">New</th>
                <th className="py-1">Movement</th>
              </tr>
            </thead>
            <tbody>
              {detail.priceHistory.map((row) => {
                const movement = (row.price_movement as PriceMovement) || "no_change";
                return (
                  <tr key={String(row.id)} className="border-t">
                    <td className="py-2 font-bold">{String(row.entity_name)}</td>
                    <td className="py-2">R{Number(row.previous_price || 0).toFixed(2)}</td>
                    <td className="py-2">R{Number(row.new_price || 0).toFixed(2)}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${priceMovementClass(movement)}`}>
                        {priceMovementLabel(movement)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      <section className="rounded-[2rem] border border-violet-100 bg-white p-5">
        <h3 className="text-sm font-black uppercase text-slate-500">Audit trail</h3>
        <div className="mt-3 space-y-3">
          {detail.approvalAudit.map((row) => (
            <div key={String(row.id)} className="rounded-xl border border-slate-100 p-3 text-sm">
              <div className="font-black text-slate-900">
                Approved by {String(row.approved_by)} · {String(row.approved_at || "").slice(0, 16)}
              </div>
              <div className="mt-1 text-slate-600">{String(row.approval_notes || "—")}</div>
              {row.reconciliation_note ? (
                <div className="mt-1 text-xs text-violet-700">Reconciliation: {String(row.reconciliation_note)}</div>
              ) : null}
              <div className="mt-2 text-[11px] text-slate-400">
                {Number(row.cost_updates_count || 0)} cost updates · {Number(row.price_history_count || 0)} price history rows
              </div>
            </div>
          ))}
          {detail.fieldCorrections.map((row) => (
            <div key={String(row.id)} className="rounded-xl border border-slate-100 p-3 text-xs">
              <span className="font-black">{String(row.field_name)}</span>: {String(row.original_value || "—")} →{" "}
              {String(row.corrected_value || "—")}
            </div>
          ))}
          {detail.rollbacks.map((row) => (
            <div key={String(row.id)} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
              Rollback by {String(row.rolled_back_by)} · {String(row.rolled_back_at || "").slice(0, 16)} ·{" "}
              {Number(row.reversal_count || 0)} reversal(s)
            </div>
          ))}
          {detail.overrideAudit.map((row) => (
            <div key={String(row.id)} className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-xs">
              <div className="font-black text-fuchsia-900">
                Supervisor override · {String(row.overridden_by || "supervisor")} ·{" "}
                {String(row.overridden_at || "").slice(0, 16)}
              </div>
              <div className="mt-1 text-fuchsia-800">{String(row.override_reason || "Policy override")}</div>
              {row.violations_snapshot ? (
                <div className="mt-1 text-[11px] text-fuchsia-700">{JSON.stringify(row.violations_snapshot)}</div>
              ) : null}
            </div>
          ))}
          {detail.riskAlerts.map((row) => (
            <div key={String(row.id)} className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs">
              <div className="font-black text-rose-900">{String(row.title || row.risk_type || "Risk")}</div>
              <div className="mt-1 text-rose-800">{String(row.description || "—")}</div>
            </div>
          ))}
        </div>
      </section>

      {detail.extractionLogs.length > 0 ? (
        <section className="rounded-[2rem] border border-violet-100 bg-white p-5">
          <h3 className="text-sm font-black uppercase text-slate-500">Extraction log</h3>
          <div className="mt-3 space-y-2">
            {detail.extractionLogs.map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-slate-100 p-3 text-xs">
                <div className="font-black text-slate-900">
                  {String(row.stage || "extract")} · {String(row.status || "—")} · {String(row.created_at || "").slice(0, 16)}
                </div>
                <div className="mt-1 text-slate-600">{String(row.message || "—")}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {rollbackOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-black text-slate-950">Rollback cost update</h3>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              Supervisor only. Reverses the latest cost updates for this invoice. Price history is preserved.
            </p>
            <label className="mt-4 block text-xs font-black uppercase text-slate-500">
              Supervisor PIN
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                value={supervisorPin}
                onChange={(e) => setSupervisorPin(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-xs font-black uppercase text-slate-500">
              Notes
              <textarea
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                rows={3}
                value={rollbackNotes}
                onChange={(e) => setRollbackNotes(e.target.value)}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setRollbackOpen(false)} className="rounded-xl px-4 py-2 text-sm font-black text-slate-600">
                Cancel
              </button>
              <button
                type="button"
                disabled={rollingBack}
                onClick={() => void handleRollback()}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
              >
                {rollingBack ? "Rolling back…" : "Confirm rollback"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
