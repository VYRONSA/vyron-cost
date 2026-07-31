"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { PoItemType } from "@/lib/vyron-procurement";
import { calcLineTotals } from "@/lib/vyron-procurement";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { ItemLookupField } from "@/components/vyron-platform/item-lookup/ItemLookupField";
import type { ItemLookupResult } from "@/lib/platform/item-lookup/ItemLookupTypes";

type LineRow = {
  id: string;
  item_type: PoItemType;
  item_id: string | null;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  expected_delivery_date: string;
};

const emptyLine = (): LineRow => ({
  id: crypto.randomUUID(),
  item_type: "ingredient",
  item_id: null,
  item_name: "",
  quantity: 1,
  unit: "kg",
  unit_price: 0,
  vat_rate: 15,
  expected_delivery_date: "",
});

function poItemTypeFromEntityType(entityType: ItemLookupResult["entityType"]): PoItemType {
  if (entityType === "finished_goods") return "product";
  if (entityType === "packaging") return "packaging";
  return "ingredient";
}

export default function ProcurementPoFormClient({
  suppliers,
  poId,
}: {
  suppliers: Array<{ id: string; supplier_name: string }>;
  poId?: string;
}) {
  const { canCreate, canEdit, canApprove } = useModulePermissions("purchase_orders");
  const canSaveDraft = poId ? canEdit : canCreate;
  const router = useRouter();
  const [supplierOptions, setSupplierOptions] = useState(suppliers);
  const [poNumber, setPoNumber] = useState(`PO-${Date.now().toString().slice(-6)}`);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Draft");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(poId));
  const [message, setMessage] = useState("");

  useEffect(() => {
    const demo = isDemoWorkspace(readActiveClient());
    if (demo) {
      setSupplierOptions(suppliers);
      return;
    }

    fetch("/api/suppliers", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.suppliers)) {
          const next = data.suppliers.map((s: { id: string; supplier_name: string }) => ({
            id: String(s.id),
            supplier_name: String(s.supplier_name || ""),
          }));
          setSupplierOptions(next);
          if (!supplierId && next[0]?.id) setSupplierId(next[0].id);
        } else {
          setSupplierOptions([]);
        }
      })
      .catch(() => setSupplierOptions([]));
  }, [suppliers]);

  useEffect(() => {
    if (!poId) return;
    setLoading(true);
    const { query } = poApiWorkspaceContext();
    fetch(`/api/purchase-orders/${poId}${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "Could not load PO.");
        const po = data.purchaseOrder;
        setPoNumber(String(po.po_number || ""));
        setSupplierId(String(po.supplier_id || supplierOptions[0]?.id || ""));
        setOrderDate(String(po.order_date || new Date().toISOString().slice(0, 10)).slice(0, 10));
        setNotes(String(po.notes || ""));
        setStatus(String(po.status || "Draft"));
        setLines(
          (po.lines || []).map((line: Record<string, unknown>) => ({
            id: String(line.id || crypto.randomUUID()),
            item_type: (line.item_type as PoItemType) || "ingredient",
            item_id: line.item_id ? String(line.item_id) : null,
            item_name: String(line.item_name || ""),
            quantity: Number(line.quantity || 0),
            unit: String(line.unit || "kg"),
            unit_price: Number(line.unit_price || 0),
            vat_rate: Number(line.vat_rate || 15),
            expected_delivery_date: String(line.expected_delivery_date || "").slice(0, 10),
          }))
        );
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load PO."))
      .finally(() => setLoading(false));
  }, [poId, supplierOptions]);

  const supplierName = supplierOptions.find((s) => s.id === supplierId)?.supplier_name || "";
  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const calc = calcLineTotals(line.quantity, line.unit_price, line.vat_rate);
        acc.subtotal += calc.subtotal;
        acc.vat += calc.vatAmount;
        acc.total += calc.lineTotal;
        return acc;
      },
      { subtotal: 0, vat: 0, total: 0 }
    );
  }, [lines]);

  function updateLine(id: string, patch: Partial<LineRow>) {
    setLines((current) => current.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  async function handleSave(submit = false) {
    if (submit ? !canApprove && !canEdit : poId ? !canEdit : !canCreate) {
      setMessage("You do not have permission to save this purchase order.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const { body: workspaceBody } = poApiWorkspaceContext();
      const payload = {
        po_number: poNumber,
        supplier_id: supplierId,
        supplier_name_snapshot: supplierName,
        status: submit ? "Submitted" : status || "Draft",
        order_date: orderDate,
        notes,
        lines: lines.filter((l) => l.item_name.trim()),
        ...workspaceBody,
      };
      const res = await fetch(poId ? `/api/purchase-orders/${poId}` : "/api/purchase-orders", {
        method: poId ? "PUT" : "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed");
      router.push(`/purchase-orders/${data.purchaseOrder.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save PO.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm font-bold text-slate-500">Loading purchase order…</p>;

  return (
    <>
      <section className="relative overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-violet-800 via-indigo-950 to-slate-950 p-8 text-white shadow-[0_24px_70px_rgba(81,63,190,0.28)]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#A855F7]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[#A855F7]/10 blur-3xl" />
        <div className="relative grid gap-7 xl:grid-cols-[1.2fr_0.8fr] xl:items-center">
          <div>
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#CBD5E1]">Premium Purchase Order Workspace</div>
            <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] md:text-5xl">Procurement Command Centre</h2>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-violet-100">Create supplier purchase orders with approval discipline, line-level cost control and clear purchasing accountability.</p>
            <div className="mt-6 flex flex-wrap gap-3">
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">Supplier</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">PO Lines</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">VAT</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">Approval</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">Cost Commitment</span>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-200">VYRON COST principle</div>
              <p className="mt-3 text-lg font-black leading-snug text-white">&ldquo;Every purchase order creates future cost. Approve it before it becomes leakage.&rdquo;</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#CBD5E1]">Business intelligence</div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">Every action on this page should improve cost visibility, margin control and financial trust.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="grid gap-6 rounded-[2rem] border border-violet-100 bg-white p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs font-black uppercase text-slate-500">
          PO Number
          <input disabled={!canSaveDraft} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold disabled:bg-slate-50" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
        </label>
        <label className="text-xs font-black uppercase text-slate-500">
          Supplier
          <select disabled={!canSaveDraft} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold disabled:bg-slate-50" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {supplierOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.supplier_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-black uppercase text-slate-500">
          Order Date
          <input type="date" disabled={!canSaveDraft} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold disabled:bg-slate-50" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </label>
        <label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
          Notes
          <textarea disabled={!canSaveDraft} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold disabled:bg-slate-50" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <div className="space-y-3">
        <div className="text-sm font-black text-slate-900">Lines</div>
        {lines.map((line) => (
          <div key={line.id} className="grid gap-2 rounded-xl border border-slate-100 p-3 md:grid-cols-8">
            <select disabled={!canSaveDraft} className="rounded-lg border px-2 py-2 text-xs font-bold disabled:bg-slate-50" value={line.item_type} onChange={(e) => updateLine(line.id, { item_type: e.target.value as PoItemType })}>
              <option value="ingredient">Ingredient</option>
              <option value="packaging">Packaging</option>
              <option value="product">Finished Product</option>
              <option value="non_stock">Non-Stock</option>
            </select>
            <div className="md:col-span-2">
              {canSaveDraft ? (
                <ItemLookupField
                  initialValue={line.item_name}
                  placeholder="Search item..."
                  onSelect={(item) =>
                    updateLine(line.id, {
                      item_id: item.entityId || item.stockItemId,
                      item_type: poItemTypeFromEntityType(item.entityType),
                      item_name: item.productName,
                      unit: item.unit,
                      unit_price: item.currentCost,
                      vat_rate: item.vatRate ?? line.vat_rate,
                    })
                  }
                />
              ) : (
                <input disabled className="w-full rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" value={line.item_name} readOnly />
              )}
            </div>
            <input disabled={!canSaveDraft} type="number" className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })} />
            <input disabled={!canSaveDraft} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" placeholder="Unit" value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} />
            <input disabled={!canSaveDraft} type="number" className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" placeholder="Unit price" value={line.unit_price} onChange={(e) => updateLine(line.id, { unit_price: Number(e.target.value) })} />
            <input disabled={!canSaveDraft} type="number" className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" placeholder="VAT %" value={line.vat_rate} onChange={(e) => updateLine(line.id, { vat_rate: Number(e.target.value) })} />
            <input disabled={!canSaveDraft} type="date" className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" value={line.expected_delivery_date} onChange={(e) => updateLine(line.id, { expected_delivery_date: e.target.value })} />
          </div>
        ))}
        <button type="button" disabled={!canSaveDraft} onClick={() => setLines((c) => [...c, emptyLine()])} className="text-xs font-black text-violet-700 disabled:opacity-50">
          + Add line
        </button>
      </div>
      <div className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-700 md:grid-cols-3">
        <div>Subtotal: <span className="font-black">R{totals.subtotal.toFixed(2)}</span></div>
        <div>VAT: <span className="font-black">R{totals.vat.toFixed(2)}</span></div>
        <div>Total: <span className="font-black">R{totals.total.toFixed(2)}</span></div>
      </div>
      {message ? <p className="text-sm font-bold text-red-600">{message}</p> : null}
      <div className="flex gap-2">
        {canSaveDraft ? (
          <button type="button" disabled={saving} onClick={() => void handleSave(false)} className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-black">
            Save Draft
          </button>
        ) : null}
        {(canSaveDraft || canApprove) ? (
          <button type="button" disabled={saving} onClick={() => void handleSave(true)} className="rounded-xl vyron-grad-surface px-4 py-2 text-sm font-semibold text-white">
            {poId ? "Save Changes" : "Submit for Approval"}
          </button>
        ) : null}
      </div>
    </section>
    </>
  );
}
