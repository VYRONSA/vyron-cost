"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { PoItemType } from "@/lib/vyron-procurement";
import { calcLineTotals } from "@/lib/vyron-procurement";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import { isPoEditableStatus } from "@/lib/vyron-po-status";
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
  const [lastRemoved, setLastRemoved] = useState<{ line: LineRow; index: number; placeholderId: string | null } | null>(null);

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

  /*
   * Loads the saved purchase order once per PO. It used to re-run whenever the
   * supplier list arrived, and that reload put every line back to its saved
   * snapshot — discarding an item the user had just picked.
   */
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
        setSupplierId((current) => String(po.supplier_id || current || ""));
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
            vat_rate: line.vat_rate === null || line.vat_rate === undefined ? 15 : Number(line.vat_rate),
            expected_delivery_date: String(line.expected_delivery_date || "").slice(0, 10),
          }))
        );
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load PO."))
      .finally(() => setLoading(false));
  }, [poId]);

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

  /*
   * Removes one product line; every other line is untouched. Nothing is written
   * until the order is saved — the server then drops the line and records the
   * removal in the procurement audit trail. The last line removed can be undone.
   */
  function removeLine(id: string) {
    const index = lines.findIndex((l) => l.id === id);
    if (index < 0) return;
    const remaining = lines.filter((l) => l.id !== id);
    const placeholder = remaining.length ? null : emptyLine();
    setLines(placeholder ? [placeholder] : remaining);
    setLastRemoved({ line: lines[index], index, placeholderId: placeholder?.id ?? null });
    setMessage("");
  }

  function undoRemoveLine() {
    if (!lastRemoved) return;
    const { line, index, placeholderId } = lastRemoved;
    setLines((current) => {
      const base = current.filter((l) => l.id !== placeholderId || l.item_name.trim());
      const at = Math.min(index, base.length);
      return [...base.slice(0, at), line, ...base.slice(at)];
    });
    setLastRemoved(null);
  }

  async function handleSave(submit = false) {
    if (submit ? !canApprove && !canEdit : poId ? !canEdit : !canCreate) {
      setMessage("You do not have permission to save this purchase order.");
      return;
    }
    const namedLines = lines.filter((l) => l.item_name.trim());
    if (!namedLines.length) {
      setMessage("Add at least one product line before saving.");
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
        lines: namedLines,
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

  // A locked order (approved, sent, received...) is never re-saved; it changes only through its status actions.
  const statusLocked = Boolean(poId) && !isPoEditableStatus(status);
  const canEditLines = canSaveDraft && !statusLocked;

  if (loading) return <p className="text-sm font-bold text-slate-500">Loading purchase order…</p>;

  return (
    <>
      <section className="relative overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-blue-800 via-indigo-950 to-slate-950 p-8 text-white shadow-[0_24px_70px_rgba(22,58,72,0.28)]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#2C5A6B]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[#2C5A6B]/10 blur-3xl" />
        <div className="relative grid gap-7 xl:grid-cols-[1.2fr_0.8fr] xl:items-center">
          <div>
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#CBD5E1]">Premium Purchase Order Workspace</div>
            <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] md:text-5xl">Procurement Command Centre</h2>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-blue-100">Create supplier purchase orders with approval discipline, line-level cost control and clear purchasing accountability.</p>
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
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">VOLORA principle</div>
              <p className="mt-3 text-lg font-black leading-snug text-white">&ldquo;Every purchase order creates future cost. Approve it before it becomes leakage.&rdquo;</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#CBD5E1]">Business intelligence</div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">Every action on this page should improve cost visibility, margin control and financial trust.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="grid gap-6 rounded-[2rem] border border-blue-100 bg-white p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs font-black uppercase text-slate-500">
          PO Number
          <input disabled={!canEditLines} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold disabled:bg-slate-50" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
        </label>
        <label className="text-xs font-black uppercase text-slate-500">
          Supplier
          <select disabled={!canEditLines} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold disabled:bg-slate-50" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {supplierOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.supplier_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-black uppercase text-slate-500">
          Order Date
          <input type="date" disabled={!canEditLines} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold disabled:bg-slate-50" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </label>
        <label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
          Notes
          <textarea disabled={!canEditLines} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold disabled:bg-slate-50" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <div className="space-y-3">
        <div className="text-sm font-black text-slate-900">Lines</div>
        {statusLocked ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
            This purchase order is {status}. Its lines are locked and cannot be changed or removed here — an approver must hand it back (reject it) before it can be amended.
          </p>
        ) : null}
        <div className="hidden gap-2 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 md:grid-cols-[7rem_minmax(0,3fr)_repeat(4,minmax(0,1fr))_8.5rem_7rem_5.5rem] md:grid">
          <div>Type</div>
          <div>Item</div>
          <div className="text-right">Qty</div>
          <div>Unit</div>
          <div className="text-right">Unit Price</div>
          <div className="text-right">VAT %</div>
          <div>Delivery</div>
          <div className="text-right">Line Total</div>
          <div className="sr-only">Remove</div>
        </div>
        {lines.map((line, lineIndex) => {
          const lineCalc = calcLineTotals(line.quantity, line.unit_price, line.vat_rate);
          const lineLabel = line.item_name.trim() || `line ${lineIndex + 1}`;
          return (
          <div key={line.id} data-testid="po-line" className="grid items-center gap-2 rounded-xl border border-slate-100 p-3 md:grid-cols-[7rem_minmax(0,3fr)_repeat(4,minmax(0,1fr))_8.5rem_7rem_5.5rem]">
            <select aria-label="Item type" disabled={!canEditLines} className="rounded-lg border px-2 py-2 text-xs font-bold disabled:bg-slate-50" value={line.item_type} onChange={(e) => updateLine(line.id, { item_type: e.target.value as PoItemType })}>
              <option value="ingredient">Ingredient</option>
              <option value="packaging">Packaging</option>
              <option value="product">Finished Product</option>
              <option value="non_stock">Non-Stock</option>
            </select>
            <div>
              {canEditLines ? (
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
                <input aria-label="Item" disabled className="w-full rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" value={line.item_name} readOnly />
              )}
            </div>
            <input aria-label="Quantity" disabled={!canEditLines} type="number" className="rounded-lg border px-2 py-2 text-right text-sm disabled:bg-slate-50" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })} />
            <input aria-label="Unit" disabled={!canEditLines} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" placeholder="Unit" value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} />
            <input aria-label="Unit price" disabled={!canEditLines} type="number" className="rounded-lg border px-2 py-2 text-right text-sm disabled:bg-slate-50" placeholder="Unit price" value={line.unit_price} onChange={(e) => updateLine(line.id, { unit_price: Number(e.target.value) })} />
            <input aria-label="VAT %" disabled={!canEditLines} type="number" className="rounded-lg border px-2 py-2 text-right text-sm disabled:bg-slate-50" placeholder="VAT %" value={line.vat_rate} onChange={(e) => updateLine(line.id, { vat_rate: Number(e.target.value) })} />
            <input aria-label="Expected delivery date" disabled={!canEditLines} type="date" className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" value={line.expected_delivery_date} onChange={(e) => updateLine(line.id, { expected_delivery_date: e.target.value })} />
            <div data-testid="po-line-total" className="text-right tabular-nums">
              <div className="text-sm font-black text-slate-950">
                <span className="mr-1 text-[10px] font-black uppercase text-slate-400 md:hidden">Line Total</span>R{lineCalc.lineTotal.toFixed(2)}
              </div>
              <div className="text-[10px] font-bold text-slate-500">excl. VAT R{lineCalc.subtotal.toFixed(2)}</div>
            </div>
            {canEditLines ? (
              <button
                type="button"
                aria-label={`Remove ${lineLabel}`}
                onClick={() => removeLine(line.id)}
                className="rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-xs font-black text-red-700 hover:bg-red-100"
              >
                Remove
              </button>
            ) : (
              <span />
            )}
          </div>
          );
        })}
        {lastRemoved ? (
          <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
            Removed {lastRemoved.line.item_name.trim() || "an empty line"}. It is taken off this purchase order when you save.
            <button type="button" onClick={undoRemoveLine} className="font-black text-blue-700 underline">
              Undo
            </button>
          </p>
        ) : null}
        <button type="button" disabled={!canEditLines} onClick={() => setLines((c) => [...c, emptyLine()])} className="text-xs font-black text-blue-700 disabled:opacity-50">
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
        {canEditLines ? (
          <button type="button" disabled={saving} onClick={() => void handleSave(false)} className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-black">
            Save Draft
          </button>
        ) : null}
        {(canEditLines || (canApprove && !statusLocked)) ? (
          <button type="button" disabled={saving} onClick={() => void handleSave(true)} className="rounded-xl vyron-grad-surface px-4 py-2 text-sm font-semibold text-white">
            {poId ? "Save Changes" : "Submit for Approval"}
          </button>
        ) : null}
      </div>
    </section>
    </>
  );
}
