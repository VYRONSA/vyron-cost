"use client";

import { Save, Trash2 } from "lucide-react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatMoney, Ingredient, Product } from "@/lib/vyron-cost-data";
import {
  calculatePoLineTotal,
  calculatePoTotals,
  deletePurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderLine,
  savePurchaseOrderHeader,
} from "@/lib/vyron-purchase-order-data";
import type { Supplier } from "@/lib/vyron-cost-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const emptyLine = (): PurchaseOrderLine => ({
  id: crypto.randomUUID(),
  po_id: "",
  item_type: "ingredient",
  item_name: "",
  quantity: 1,
  unit: "kg",
  unit_cost: 0,
  line_total: 0,
});

export default function PurchaseOrderFormClient({
  order,
  suppliers,
  ingredients,
  products,
  companyId,
  mode,
}: {
  order?: PurchaseOrderDetail;
  suppliers: Supplier[];
  ingredients: Ingredient[];
  products: Product[];
  companyId: string;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [poNumber, setPoNumber] = useState(order?.po_number || `PO-${Date.now().toString().slice(-4)}`);
  const [supplierId, setSupplierId] = useState(order?.supplier_id || suppliers[0]?.id || "");
  const [status, setStatus] = useState(order?.status || "Draft");
  const [orderDate, setOrderDate] = useState(order?.order_date || new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(order?.notes || "");
  const [lines, setLines] = useState<PurchaseOrderLine[]>(order?.lines?.length ? order.lines : [emptyLine()]);
  const [message, setMessage] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const supplierName = suppliers.find((s) => s.id === supplierId)?.supplier_name || order?.supplier_name_snapshot || "";

  const totals = useMemo(() => calculatePoTotals(lines), [lines]);
  const invoiceTotal = order?.invoice_total ?? totals.expected;

  function updateLine(id: string, patch: Partial<PurchaseOrderLine>) {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        next.line_total = calculatePoLineTotal(Number(next.quantity), Number(next.unit_cost));
        return next;
      })
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(id: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.id !== id)));
  }

  function pickCatalogItem(lineId: string, catalogId: string) {
    const ingredient = ingredients.find((item) => item.id === catalogId);
    const product = products.find((item) => item.id === catalogId);
    if (ingredient) {
      updateLine(lineId, {
        item_id: ingredient.id,
        item_type: "ingredient",
        item_name: ingredient.ingredient_name,
        unit: ingredient.purchase_unit,
        unit_cost: Number(ingredient.purchase_cost),
      });
      return;
    }
    if (product) {
      updateLine(lineId, {
        item_id: product.id,
        item_type: "product",
        item_name: product.product_name,
        unit: "unit",
        unit_cost: Number(product.total_cost),
      });
    }
  }

  async function savePo() {
    try {
      const payload: PurchaseOrderDetail = {
        id: order?.id || crypto.randomUUID(),
        company_id: companyId,
        supplier_id: supplierId || null,
        po_number: poNumber,
        supplier_name_snapshot: supplierName,
        status,
        expected_total: totals.expected,
        invoice_total: invoiceTotal,
        variance: invoiceTotal - totals.expected,
        order_date: orderDate,
        notes,
        lines,
      };

      if (supabaseWritable()) {
        await savePurchaseOrderHeader(payload, companyId);
      }

      setMessage("Purchase order saved.");
      router.push(`/purchase-orders/${payload.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save PO.");
    }
  }

  async function removePo() {
    if (!order?.id) return;
    setDeleting(true);
    try {
      await deletePurchaseOrder(order.id);
      router.push("/purchase-orders");
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  }

  function supabaseWritable() {
    return companyId !== "demo-company";
  }

  return (
    <VyronPremiumPageShell
      config={{
        title: "Purchase Order Form",
        subtitle: "Premium VYRON COST workflow for purchase order form.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <>
          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-black text-[#F8FAFC]">{mode === "create" ? "Create Purchase Order" : "Edit Purchase Order"}</h2>
                <Link href="/purchase-orders" className="text-sm font-black text-[#7E22CE]">
                  Back to register
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-black text-slate-600">
                  PO Number
                  <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
                </label>
                <label className="text-sm font-black text-slate-600">
                  Supplier
                  <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.supplier_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-black text-slate-600">
                  Order Date
                  <input type="date" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                </label>
                <label className="text-sm font-black text-slate-600">
                  Status
                  <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={status} onChange={(e) => setStatus(e.target.value)}>
                    {["Draft", "Review", "Approved", "Matched", "Invoice Variance", "Received"].map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-black text-slate-900">Line Items</h3>
                  <button type="button" onClick={addLine} className="rounded-full border border-[#A855F7]/25 bg-[#A855F7]/10 px-4 py-2 text-xs font-black text-[#7E22CE]">
                    + Add line
                  </button>
                </div>

                <div className="space-y-4">
                  {lines.map((line) => (
                    <div key={line.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="grid gap-3 md:grid-cols-6">
                        <label className="md:col-span-2 text-xs font-black text-slate-500">
                          Catalog item
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                            value={line.item_id || ""}
                            onChange={(e) => pickCatalogItem(line.id, e.target.value)}
                          >
                            <option value="">Manual entry</option>
                            <optgroup label="Ingredients">
                              {ingredients.slice(0, 40).map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.ingredient_name}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Products">
                              {products.slice(0, 20).map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.product_name}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </label>
                        <label className="md:col-span-2 text-xs font-black text-slate-500">
                          Item name
                          <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" value={line.item_name} onChange={(e) => updateLine(line.id, { item_name: e.target.value })} />
                        </label>
                        <label className="text-xs font-black text-slate-500">
                          Qty
                          <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })} />
                        </label>
                        <label className="text-xs font-black text-slate-500">
                          Unit
                          <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} />
                        </label>
                        <label className="text-xs font-black text-slate-500">
                          Unit cost
                          <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" value={line.unit_cost} onChange={(e) => updateLine(line.id, { unit_cost: Number(e.target.value) })} />
                        </label>
                        <div className="flex items-end justify-between gap-3 md:col-span-2">
                          <div>
                            <div className="text-xs font-black uppercase text-slate-400">Line total</div>
                            <div className="text-lg font-black text-violet-700">{formatMoney(line.line_total)}</div>
                          </div>
                          <button type="button" onClick={() => removeLine(line.id)} className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <label className="mt-6 block text-sm font-black text-slate-600">
                Notes
                <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>

              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={savePo} className="inline-flex items-center gap-2 rounded-2xl border border-transparent vyron-grad-surface px-6 py-4 text-sm font-black text-[#F8FAFC]">
                  <Save size={18} />
                  Save PO
                </button>
                {mode === "edit" ? (
                  <button type="button" onClick={() => setConfirmDeleteOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-6 py-4 text-sm font-black text-red-700">
                    <Trash2 size={18} />
                    Delete PO
                  </button>
                ) : null}
              </div>

              {message ? <div className="mt-4 rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3 text-sm font-black text-[#7E22CE]">{message}</div> : null}
            </div>

            <aside className="rounded-[2rem] vyron-grad-deep p-6 text-white">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-[#DDD6FE]">PO Summary</div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs text-white/50">Expected total</div>
                  <div className="text-3xl font-black">{formatMoney(totals.expected)}</div>
                </div>
                <div>
                  <div className="text-xs text-white/50">Invoice total</div>
                  <div className="text-3xl font-black">{formatMoney(invoiceTotal)}</div>
                </div>
                <div>
                  <div className="text-xs text-white/50">Variance</div>
                  <div className="text-3xl font-black text-red-300">{formatMoney(invoiceTotal - totals.expected)}</div>
                </div>
              </div>
            </aside>
          </section>
          <ConfirmDeleteDialog
            open={confirmDeleteOpen}
            confirming={deleting}
            message={`Are you sure you want to delete ${poNumber || "this purchase order"}? This action cannot be undone.`}
            onCancel={() => setConfirmDeleteOpen(false)}
            onConfirm={() => void removePo()}
          />
          </>
    </VyronPremiumPageShell>
  );
}
