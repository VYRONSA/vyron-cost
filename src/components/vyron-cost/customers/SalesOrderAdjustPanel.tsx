"use client";

import { useEffect, useState } from "react";

type Line = { id: string; product_id: string | null; description: string; quantity: number; unit: string; selling_price: number; discount_pct: number; tax_rate: number; line_total: number };
type Totals = { subtotal: number; vatAmount: number; total: number; grossProfit: number; gpPercentage: number };
type Preview = {
  before: { totals: Totals };
  after: { totals: Totals; lines: Array<{ id?: string; description: string; quantity: number; sellingPrice: number; discountPct?: number }> };
  changes: Array<{ description: string; field: string; from: string; to: string }>;
  approvalRules: Array<{ code: string; message: string }>;
};
type Product = { id: string; product_name: string; sku?: string | null };

const ADJUSTABLE = ["Draft", "Awaiting Approval", "Approved"];
const money = (v: number) => `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const input = "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-semibold";

/**
 * Controlled manual adjustment of an order that has not been processed. Quantities, discounts,
 * removed and added lines; a reason is required; the server prices added lines from the
 * customer's price list and recalculates totals and VAT. Preview first, then apply.
 */
export default function SalesOrderAdjustPanel({ orderId, status, lines, onAdjusted }: { orderId: string; status: string; lines: Line[]; onAdjusted: () => void }) {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, { quantity: string; discount: string; remove: boolean }>>({});
  const [added, setAdded] = useState<Array<{ key: string; productId: string; quantity: string }>>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || products.length) return;
    let cancelled = false;
    void fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.ok) setProducts((d.products || []).filter((p: Product & { status?: string }) => !/^(inactive|archived|deleted)$/i.test(String(p.status || ""))));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, products.length]);

  if (!ADJUSTABLE.includes(status)) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500" data-testid="order-adjust-locked">
        Manual adjustment: this order is {status} — processed or locked orders cannot be adjusted.
      </div>
    );
  }

  const start = () => {
    setOpen(true);
    setEdits(Object.fromEntries(lines.map((l) => [l.id, { quantity: String(l.quantity), discount: String(l.discount_pct || 0), remove: false }])));
    setAdded([]);
    setReason("");
    setPreview(null);
    setError("");
  };

  const payload = (dryRun: boolean) => ({
    reason,
    dryRun,
    lines: [
      ...lines.map((l) => {
        const e = edits[l.id];
        if (!e) return { id: l.id };
        return e.remove ? { id: l.id, remove: true } : { id: l.id, quantity: Number(e.quantity), discountPct: Number(e.discount) };
      }),
      ...added.filter((a) => a.productId).map((a) => ({ productId: a.productId, quantity: Number(a.quantity) })),
    ],
  });

  const send = async (dryRun: boolean) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/customer-sales-orders/${orderId}/adjust`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(dryRun)) });
      const data = await res.json();
      if (!data.ok) {
        const short = Array.isArray(data.shortages) && data.shortages.length ? ` Short: ${data.shortages.map((s: { description?: string; shortfall_qty?: number }) => `${s.description || "item"} ${s.shortfall_qty ?? ""}`).join(", ")}` : "";
        throw new Error((data.error || "Adjustment failed.") + short);
      }
      if (dryRun) setPreview(data);
      else {
        setOpen(false);
        setPreview(null);
        onAdjusted();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Adjustment failed.");
      if (dryRun) setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3" data-testid="order-adjust">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black uppercase tracking-[0.12em] text-amber-900">Manual adjustment</div>
        {!open ? (
          <button type="button" onClick={start} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-black text-amber-900">
            Adjust order
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 grid gap-3">
          <p className="text-xs font-semibold text-amber-900">
            Existing lines keep their agreed price. Added products are priced from this customer&apos;s price list. Totals and VAT are recalculated; the original order is kept in the audit trail.
            {status === "Approved" ? " Stock is re-reserved for the new quantities; if stock is short nothing is changed." : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                <tr><th className="py-1 pr-2">Line</th><th className="py-1 pr-2 text-right">Price</th><th className="py-1 pr-2">Quantity</th><th className="py-1 pr-2">Discount %</th><th className="py-1 pr-2">Remove</th></tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const e = edits[l.id] || { quantity: String(l.quantity), discount: String(l.discount_pct || 0), remove: false };
                  const set = (patch: Partial<typeof e>) => { setEdits((cur) => ({ ...cur, [l.id]: { ...e, ...patch } })); setPreview(null); };
                  return (
                    <tr key={l.id} className={`border-t border-amber-100 ${e.remove ? "opacity-50" : ""}`}>
                      <td className="py-1.5 pr-2 font-semibold">{l.description} <span className="text-xs text-slate-400">({l.unit})</span></td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{money(l.selling_price)}</td>
                      <td className="py-1.5 pr-2"><input className={input} type="number" min="0" step="any" value={e.quantity} disabled={e.remove} onChange={(ev) => set({ quantity: ev.target.value })} /></td>
                      <td className="py-1.5 pr-2"><input className={input} type="number" min="0" max="100" step="any" value={e.discount} disabled={e.remove} onChange={(ev) => set({ discount: ev.target.value })} /></td>
                      <td className="py-1.5 pr-2"><input type="checkbox" checked={e.remove} onChange={(ev) => set({ remove: ev.target.checked })} /></td>
                    </tr>
                  );
                })}
                {added.map((a) => (
                  <tr key={a.key} className="border-t border-amber-100">
                    <td className="py-1.5 pr-2" colSpan={2}>
                      <select className={input} value={a.productId} onChange={(ev) => { setAdded((cur) => cur.map((x) => (x.key === a.key ? { ...x, productId: ev.target.value } : x))); setPreview(null); }}>
                        <option value="">Choose a product…</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.product_name}{p.sku ? ` (${p.sku})` : ""}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2"><input className={input} type="number" min="0" step="any" value={a.quantity} onChange={(ev) => { setAdded((cur) => cur.map((x) => (x.key === a.key ? { ...x, quantity: ev.target.value } : x))); setPreview(null); }} /></td>
                    <td className="py-1.5 pr-2 text-xs text-slate-500">Price list</td>
                    <td className="py-1.5 pr-2"><button type="button" className="text-xs font-black text-rose-700" onClick={() => { setAdded((cur) => cur.filter((x) => x.key !== a.key)); setPreview(null); }}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="w-fit text-xs font-black text-amber-900 underline" onClick={() => setAdded((cur) => [...cur, { key: `${Date.now()}-${cur.length}`, productId: "", quantity: "1" }])}>
            + Add a product
          </button>
          <label className="grid gap-1 text-xs font-black uppercase text-slate-600">
            Reason (required)
            <textarea className="min-h-[60px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold normal-case" value={reason} onChange={(e) => { setReason(e.target.value); setPreview(null); }} placeholder="e.g. Customer phoned to reduce pies from 40 to 30" />
          </label>
          {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{error}</div> : null}
          {preview ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm" data-testid="order-adjust-preview">
              <div className="font-black text-slate-800">Changes</div>
              <ul className="mt-1 list-disc pl-5 text-slate-700">
                {preview.changes.map((c, i) => <li key={i}>{c.field === "added" ? `Add ${c.description} × ${c.to}` : c.field === "removed" ? `Remove ${c.description}` : `${c.description}: ${c.field} ${c.from} → ${c.to}`}</li>)}
              </ul>
              <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
                <div>Excl. VAT <b>{money(preview.before.totals.subtotal)}</b> → <b>{money(preview.after.totals.subtotal)}</b></div>
                <div>VAT <b>{money(preview.before.totals.vatAmount)}</b> → <b>{money(preview.after.totals.vatAmount)}</b></div>
                <div>Total <b>{money(preview.before.totals.total)}</b> → <b>{money(preview.after.totals.total)}</b></div>
                <div>GP <b>{preview.before.totals.gpPercentage}%</b> → <b>{preview.after.totals.gpPercentage}%</b></div>
              </div>
              {preview.approvalRules.length ? <div className="mt-2 text-xs font-semibold text-amber-800">Approval flags after adjustment: {preview.approvalRules.map((r) => r.message).join("; ")}</div> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => void send(true)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-800 disabled:opacity-50">
              Preview totals
            </button>
            <button type="button" disabled={busy || !preview} onClick={() => void send(false)} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
              Apply adjustment
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-xs font-black text-slate-600">Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
