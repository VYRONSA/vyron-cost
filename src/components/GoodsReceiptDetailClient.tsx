"use client";

import Link from "next/link";
import { Download, Mail, Pencil, Printer, Save, ShieldCheck, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import {
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

type GrnLine = Record<string, unknown> & {
  id?: string;
  item_name?: string;
  ordered_qty?: number;
  received_qty?: number;
  damaged_qty?: number;
  rejected_qty?: number;
  outstanding_qty?: number;
  unit?: string;
};

function num(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function GoodsReceiptDetailClient({ grnId }: { grnId: string }) {
  const { canCreate } = useModulePermissions("goods_receipts");
  const canEdit = canCreate;
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [stockPosted, setStockPosted] = useState(false);
  const [lines, setLines] = useState<GrnLine[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Posted");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { query } = poApiWorkspaceContext();
    const res = await fetch(`/api/goods-receipts/${grnId}${query}`, { cache: "no-store" });
    const data = await res.json();
    if (!data.ok) {
      setMessage(data.error || "Could not load GRN.");
      setReceipt(null);
      return;
    }
    setReceipt(data.receipt);
    setStockPosted(Boolean(data.receipt.stock_posted));
    setLines(((data.receipt.lines || []) as GrnLine[]).map((line) => ({ ...line })));
    setNotes(String(data.receipt.notes || ""));
    setStatus(String(data.receipt.status || "Posted"));
  }, [grnId]);

  useEffect(() => {
    void load();
  }, [load]);

  const po = receipt?.vyron_cost_purchase_orders as { id?: string; po_number?: string; supplier_name_snapshot?: string } | null;
  const totals = useMemo(() => ({
    received: lines.reduce((sum, line) => sum + num(line.received_qty), 0),
    damaged: lines.reduce((sum, line) => sum + num(line.damaged_qty), 0),
    rejected: lines.reduce((sum, line) => sum + num(line.rejected_qty), 0),
    outstanding: lines.reduce((sum, line) => sum + Math.max(0, num(line.ordered_qty) - num(line.received_qty) - num(line.damaged_qty) - num(line.rejected_qty)), 0),
  }), [lines]);

  function updateLine(index: number, patch: Partial<GrnLine>) {
    setLines((current) => current.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  }

  function validateLines() {
    for (const line of lines) {
      const label = String(line.item_name || "Line item");
      if (num(line.received_qty) < 0 || num(line.damaged_qty) < 0 || num(line.rejected_qty) < 0) return `${label} cannot have negative quantities.`;
      const totalHandled = num(line.received_qty) + num(line.damaged_qty) + num(line.rejected_qty);
      if (totalHandled - num(line.ordered_qty) > 0.0001) return `${label} exceeds the ordered quantity.`;
    }
    return "";
  }

  async function saveGrn() {
    if (!canEdit) {
      setMessage("You do not have permission to edit goods receipts.");
      return;
    }
    if (!stockPosted) {
      const validation = validateLines();
      if (validation) {
        setMessage(validation);
        return;
      }
    }
    if (!window.confirm(stockPosted ? "Save GRN notes?" : "Save GRN changes and recalculate linked PO outstanding quantities?")) return;
    setSaving(true);
    try {
      const { body: workspaceBody } = poApiWorkspaceContext();
      const res = await fetch(`/api/goods-receipts/${grnId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...workspaceBody,
          notes,
          status: stockPosted ? undefined : status,
          lines: stockPosted ? undefined : lines,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed.");
      setMessage("GRN updated. Linked PO quantities recalculated.");
      setEditing(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save GRN.");
    } finally {
      setSaving(false);
    }
  }

  function emailGrn() {
    const subject = encodeURIComponent(`Goods Received Note ${String(receipt?.grn_number || grnId)}`);
    const body = encodeURIComponent(`Please find goods received note ${String(receipt?.grn_number || grnId)}.\nSupplier: ${String(receipt?.supplier_name_snapshot || "Supplier")}\nSource PO: ${po?.po_number || "N/A"}\nReceived: ${totals.received.toFixed(2)}\nDamaged/Rejected: ${(totals.damaged + totals.rejected).toFixed(2)}\nOutstanding: ${totals.outstanding.toFixed(2)}\n\nSent from VYRON COST.`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function exportCsv() {
    const header = ["Item", "Ordered", "Received", "Damaged", "Rejected", "Outstanding", "Unit"];
    const rows = lines.map((line) => {
      const outstanding = Math.max(0, num(line.ordered_qty) - num(line.received_qty) - num(line.damaged_qty) - num(line.rejected_qty));
      return [line.item_name, num(line.ordered_qty), num(line.received_qty), num(line.damaged_qty), num(line.rejected_qty), outstanding, line.unit];
    });
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vyron-cost-grn-${String(receipt?.grn_number || grnId)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!receipt) return <p className="text-sm font-bold text-slate-500">{message || "Loading GRN…"}</p>;

  return (
    <section className="grid gap-8">
      <div className="print:hidden">
        <VyronPremiumHeroBanner
        visualVariant="goods-receipt"
          badge="Premium Receipt Detail"
          title={String(receipt.grn_number || grnId)}
          subtitle={`${String(receipt.supplier_name_snapshot || "Supplier")} · ${String(receipt.receipt_type || "receipt")} · ${String(receipt.received_at || "").slice(0, 16)}`}
          quotes={[
            {
              label: "Receiving control",
              quote: "A GRN is the operational truth between what was ordered and what entered stock.",
            },
            {
              label: stockPosted ? "Stock posted" : "Draft control",
              quote: stockPosted ? "Posted receipts protect stock accuracy by locking quantity changes." : "Review quantities carefully before stock is posted.",
            },
          ]}
        >
          <Link href="/goods-receipts/history" className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white backdrop-blur-sm">
            ← Back
          </Link>
        </VyronPremiumHeroBanner>
      </div>

      <div className="rounded-[2rem] border border-violet-100 bg-white p-5 shadow-[0_18px_60px_rgba(76,29,149,0.08)] print:hidden">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
              <Truck size={13} /> Receipt Actions
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-950">GRN control panel</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Print, export, email, edit notes or receive any remaining balance.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {po?.id ? <Link href={`/purchase-orders/${po.id}`} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-800">Open PO</Link> : null}
          {po?.id && canCreate ? <Link href={`/goods-receipts/new?po=${po.id}`} className="rounded-xl bg-fuchsia-50 px-3 py-2 text-xs font-black text-fuchsia-700">Receive Balance</Link> : null}
          {canEdit ? (
            <button type="button" onClick={() => setEditing((value) => !value)} className="inline-flex items-center gap-1 rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white"><Pencil size={14} />{editing ? "Cancel Edit" : stockPosted ? "Edit Notes" : "Edit GRN"}</button>
          ) : null}
          {editing && canEdit ? <button type="button" disabled={saving} onClick={() => void saveGrn()} className="inline-flex items-center gap-1 rounded-xl bg-[#24183F] border border-[#A3E635]/30 px-3 py-2 text-xs font-black text-[#F8FAFC] disabled:opacity-60"><Save size={14} />{saving ? "Saving…" : "Save GRN"}</button> : null}
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-800"><Printer size={14} />Print</button>
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1 rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-800"><Download size={14} />Export CSV</button>
          <button type="button" onClick={emailGrn} className="inline-flex items-center gap-1 rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-800"><Mail size={14} />Email</button>
        </div>
      </div>

      {message ? <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 print:hidden">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2 print:hidden">
        <VyronPremiumFormulaCard
          variant="light"
          eyebrow="Receipt integrity"
          title="How this GRN is reconciled"
          formulas={[
            { label: "Outstanding", formula: "Ordered − received − damaged − rejected" },
            { label: "Accepted Stock", formula: "Received qty posts to stock ledger" },
          ]}
        />
        <VyronPremiumFormulaCard
          eyebrow="Audit trail"
          title="Why this receipt matters"
          formulas={[
            { label: "PO Link", formula: "GRN must trace back to the source PO" },
            { label: "Invoice Match", formula: "PO + GRN + supplier invoice must agree" },
          ]}
        />
      </div>

      <VyronPremiumSectionHeading
        eyebrow="Receipt summary"
        title="Quantities and status"
        subtitle="Review what was accepted, rejected, damaged and still outstanding."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-[10px] font-black uppercase text-violet-600">Linked PO</div>{po?.id ? <Link href={`/purchase-orders/${po.id}`} className="mt-2 block text-lg font-black text-violet-700">{po.po_number}</Link> : <div className="mt-2 text-lg font-black">—</div>}</div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-[10px] font-black uppercase text-violet-600">Received</div><div className="mt-2 text-lg font-black">{totals.received.toFixed(2)}</div></div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-[10px] font-black uppercase text-violet-600">Damaged/Rejected</div><div className="mt-2 text-lg font-black">{(totals.damaged + totals.rejected).toFixed(2)}</div></div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-[10px] font-black uppercase text-violet-600">Status</div>{editing && !stockPosted ? <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2 font-bold"><option>Posted</option><option>Draft</option><option>Corrected</option><option>Cancelled</option></select> : <div className="mt-2 text-lg font-black">{String(receipt.status || "Posted")}{stockPosted ? <span className="mt-1 block text-xs font-bold text-[#65A30D]">Stock posted</span> : null}</div>}</div>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-[2rem] border border-violet-100 bg-white">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="bg-violet-800 text-xs font-black uppercase tracking-[0.14em] text-violet-100"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Ordered</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Damaged</th><th className="px-4 py-3">Rejected</th><th className="px-4 py-3">Outstanding</th><th className="px-4 py-3">Unit</th></tr></thead>
          <tbody>
            {lines.map((line, index) => {
              const outstanding = Math.max(0, num(line.ordered_qty) - num(line.received_qty) - num(line.damaged_qty) - num(line.rejected_qty));
              const lineEditing = editing && !stockPosted;
              return <tr key={String(line.id || index)} className="border-t border-slate-100"><td className="px-4 py-3 font-bold">{String(line.item_name)}</td><td className="px-4 py-3">{num(line.ordered_qty)}</td><td className="px-4 py-3">{lineEditing ? <input type="number" min="0" className="w-24 rounded-xl border px-2 py-1 font-bold" value={num(line.received_qty)} onChange={(e) => updateLine(index, { received_qty: num(e.target.value) })} /> : num(line.received_qty)}</td><td className="px-4 py-3">{lineEditing ? <input type="number" min="0" className="w-24 rounded-xl border px-2 py-1 font-bold" value={num(line.damaged_qty)} onChange={(e) => updateLine(index, { damaged_qty: num(e.target.value) })} /> : num(line.damaged_qty)}</td><td className="px-4 py-3">{lineEditing ? <input type="number" min="0" className="w-24 rounded-xl border px-2 py-1 font-bold" value={num(line.rejected_qty)} onChange={(e) => updateLine(index, { rejected_qty: num(e.target.value) })} /> : num(line.rejected_qty)}</td><td className="px-4 py-3 font-black text-violet-700">{outstanding.toFixed(2)}</td><td className="px-4 py-3">{String(line.unit || "—")}</td></tr>;
            })}
          </tbody>
        </table>
      </div>

      <label className="grid gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500 print:hidden">GRN Notes<textarea disabled={!editing} className="min-h-24 rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-800 disabled:bg-slate-50" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    </section>
  );
}
