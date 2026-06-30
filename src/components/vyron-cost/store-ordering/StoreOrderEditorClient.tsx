"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { StoreOrderWarningBadges } from "@/components/vyron-cost/store-ordering/StoreOrderWarningBadges";
import { formatStoreOrderMoney } from "@/components/vyron-cost/store-ordering/store-order-ui";
import type { StoreOrderWarning } from "@/lib/vyron-store-order-commercial";
import {
  isStoreOrderEditable,
  nextStoreOrderStatuses,
  storeOrderStatusLabel,
  type FinishedGoodOption,
  type StoreOrderLineInput,
  type StoreOrderRow,
  type StoreRow,
} from "@/lib/vyron-store-orders";

type EditorLine = StoreOrderLineInput & { key: string };

function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcPreview(line: EditorLine) {
  const qty = Number(line.quantity || 0);
  const price = Number(line.unit_price || 0);
  const vatRate = Number(line.vat_rate ?? 15);
  const net = qty * price;
  const vat = net * (vatRate / 100);
  return net + vat;
}

function emptyLine(products: FinishedGoodOption[]): EditorLine {
  const first = products[0];
  return {
    key: crypto.randomUUID(),
    product_id: first?.id || "",
    product_name_snapshot: first?.product_name || "",
    quantity: 1,
    unit: "each",
    unit_price: first?.selling_price || 0,
    vat_rate: 15,
  };
}

export default function StoreOrderEditorClient({ orderId }: { orderId?: string }) {
  const router = useRouter();
  const { canCreate, canEdit, canApprove, canDelete } = useModulePermissions("store_orders");
  const isNew = !orderId;

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [products, setProducts] = useState<FinishedGoodOption[]>([]);
  const [order, setOrder] = useState<StoreOrderRow | null>(null);
  const [storeId, setStoreId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [requiredDate, setRequiredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<StoreOrderWarning[]>([]);

  const editable = isNew || (order ? isStoreOrderEditable(order.status) : false);
  const canSave = isNew ? canCreate : canEdit && editable;

  const previewTotal = useMemo(
    () => lines.reduce((sum, line) => sum + calcPreview(line), 0),
    [lines]
  );

  const nextStatuses = order ? nextStoreOrderStatuses(order.status) : [];

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [storesRes, catalogRes, orderRes] = await Promise.all([
        fetch("/api/stores?activeOnly=true"),
        fetch("/api/store-orders?includeProducts=true"),
        orderId ? fetch(`/api/store-orders/${orderId}`) : Promise.resolve(null),
      ]);

      const storesData = await storesRes.json();
      const catalogData = await catalogRes.json();

      if (storesData.ok) setStores(storesData.stores as StoreRow[]);
      if (catalogData.ok && Array.isArray(catalogData.products)) {
        setProducts(catalogData.products as FinishedGoodOption[]);
      }

      if (orderRes) {
        const orderData = await orderRes.json();
        if (!orderData.ok || !orderData.order) {
          setError(orderData.error || "Store order not found.");
          return;
        }
        const loaded = orderData.order as StoreOrderRow;
        setOrder(loaded);
        setStoreId(loaded.store_id);
        setOrderDate(loaded.order_date);
        setRequiredDate(loaded.required_date || "");
        setNotes(loaded.notes || "");
        setLines(
          (loaded.lines || []).map((line) => ({
            key: line.id,
            product_id: line.product_id,
            product_name_snapshot: line.product_name_snapshot,
            quantity: line.quantity,
            unit: line.unit,
            unit_price: line.unit_price,
            vat_rate: line.vat_rate,
          }))
        );
        const warningsRes = await fetch(`/api/store-orders/${orderId}/warnings`);
        const warningsData = await warningsRes.json();
        if (warningsData.ok) setWarnings(warningsData.warnings || []);
      } else if (catalogData.ok && Array.isArray(catalogData.products) && catalogData.products.length) {
        setLines([emptyLine(catalogData.products as FinishedGoodOption[])]);
      }

      if (storesData.ok && !orderId && storesData.stores?.length) {
        setStoreId(String(storesData.stores[0].id));
      }
    } catch {
      setError("Could not load store order.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [orderId]);

  function updateLine(key: string, patch: Partial<EditorLine>) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.product_id) {
          const product = products.find((item) => item.id === patch.product_id);
          if (product) {
            next.product_name_snapshot = product.product_name;
            next.unit_price = product.selling_price;
          }
        }
        return next;
      })
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine(products)]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.key !== key)));
  }

  async function saveOrder() {
    if (!storeId) {
      setError("Select a store.");
      return;
    }
    if (!lines.length) {
      setError("Add at least one order line.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(isNew ? "/api/store-orders" : `/api/store-orders/${orderId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          order_date: orderDate,
          required_date: requiredDate || null,
          notes,
          lines: lines.map(({ key: _key, ...line }) => line),
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Save failed.");
        return;
      }

      if (isNew) {
        router.push(`/store-orders/${data.order.id}`);
        return;
      }

      setOrder(data.order as StoreOrderRow);
      setMessage("Store order saved.");
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function transitionStatus(status: string) {
    if (!orderId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/store-orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Status update failed.");
        return;
      }
      setOrder(data.order as StoreOrderRow);
      setMessage(`Order moved to ${status}.`);
    } catch {
      setError("Status update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder() {
    if (!orderId || !canDelete) return;
    if (!window.confirm("Delete this draft store order?")) return;
    const response = await fetch(`/api/store-orders/${orderId}`, { method: "DELETE" });
    const data = await response.json();
    if (!data.ok) {
      setError(data.error || "Delete failed.");
      return;
    }
    router.push("/store-orders");
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Store Ordering",
        title: isNew ? "New Store Order" : order?.order_number || "Store Order",
        subtitle: isNew
          ? "Create a draft store order against finished goods."
          : `Status: ${order ? storeOrderStatusLabel(order.status) : "—"} · Store: ${order?.store_name_snapshot || "—"}`,
        outcomes: [
          "Lines pull from finished goods catalogue",
          "Draft edits only before submission",
          "Workflow: Draft → Submitted → Approved → Picking → Ready for Dispatch → Dispatched → Delivered",
        ],
      }}
      actions={
        <Link
          href="/store-orders"
          className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]"
        >
          Back to orders
        </Link>
      }
    >
      <div className="space-y-6">
        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        {!isNew && order ? (
          <section className={`${VYRON_MASTER.moduleDataSection} grid gap-4 md:grid-cols-4`}>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Order Value</div>
              <div className="mt-1 text-xl font-black text-[#0F172A]">
                {formatStoreOrderMoney(order.order_value || order.subtotal)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Estimated Cost</div>
              <div className="mt-1 text-xl font-black text-[#0F172A]">
                {formatStoreOrderMoney(order.estimated_cost || 0)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Gross Margin</div>
              <div className="mt-1 text-xl font-black text-[#0F172A]">
                {formatStoreOrderMoney(order.gross_margin || 0)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Margin %</div>
              <div className="mt-1 text-xl font-black text-[#0F172A]">
                {Number(order.margin_pct || 0).toFixed(1)}%
              </div>
            </div>
            {warnings.length ? (
              <div className="md:col-span-4">
                <StoreOrderWarningBadges warnings={warnings} />
                <ul className="mt-2 space-y-1 text-sm text-amber-800">
                  {warnings.map((warning) => (
                    <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
            Loading store order…
          </div>
        ) : (
          <>
            <section className={`${VYRON_MASTER.moduleDataSection} grid gap-4 md:grid-cols-2`}>
              <label className="space-y-2 text-sm font-semibold text-[#334155]">
                Store
                <select
                  value={storeId}
                  disabled={!editable}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                >
                  <option value="">Select store</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.store_code} — {store.store_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-[#334155]">
                Order date
                <input
                  type="date"
                  value={orderDate}
                  disabled={!editable}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-[#334155]">
                Required date
                <input
                  type="date"
                  value={requiredDate}
                  disabled={!editable}
                  onChange={(e) => setRequiredDate(e.target.value)}
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-[#334155] md:col-span-2">
                Notes
                <textarea
                  value={notes}
                  disabled={!editable}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[88px] w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                />
              </label>
            </section>

            <section className={VYRON_MASTER.moduleDataSection}>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-lg font-black text-[#0F172A]">Order Lines</h2>
                {editable ? (
                  <button
                    type="button"
                    onClick={addLine}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-bold"
                  >
                    <Plus size={16} />
                    Add line
                  </button>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
                <table className="min-w-full">
                  <thead className={VYRON_TABLE.head}>
                    <tr>
                      <th className="px-4 py-3 text-left">Finished Good</th>
                      <th className="px-4 py-3 text-left">Qty</th>
                      <th className="px-4 py-3 text-left">Unit</th>
                      <th className="px-4 py-3 text-left">Unit Price</th>
                      <th className="px-4 py-3 text-right">Line Total</th>
                      {editable ? <th className="px-4 py-3 text-left"> </th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.key} className={VYRON_TABLE.row}>
                        <td className="px-4 py-3">
                          <select
                            value={line.product_id}
                            disabled={!editable}
                            onChange={(e) => updateLine(line.key, { product_id: e.target.value })}
                            className="w-full min-w-[220px] rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                          >
                            <option value="">Select product</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.product_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.0001"
                            value={line.quantity}
                            disabled={!editable}
                            onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                            className="w-24 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={line.unit || "each"}
                            disabled={!editable}
                            onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                            className="w-24 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unit_price}
                            disabled={!editable}
                            onChange={(e) => updateLine(line.key, { unit_price: Number(e.target.value) })}
                            className="w-28 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-[#0F172A]">
                          {formatMoney(calcPreview(line))}
                        </td>
                        {editable ? (
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => removeLine(line.key)}
                              className="rounded-lg border border-rose-200 p-2 text-rose-700"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-right text-lg font-black text-[#0F172A]">
                Preview total: {formatMoney(previewTotal)}
              </div>
            </section>

            <section className="flex flex-wrap gap-3">
              {canSave ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveOrder()}
                  className={`${VYRON_MASTER.primaryBtn} px-4 py-2.5 text-sm disabled:opacity-60`}
                >
                  {saving ? "Saving…" : isNew ? "Create Draft Order" : "Save Draft"}
                </button>
              ) : null}

              {!isNew && nextStatuses.map((status) => {
                const needsApprove = status === "Approved" || status === "Cancelled";
                if (needsApprove && !canApprove) return null;
                if (!needsApprove && !canEdit) return null;
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={saving}
                    onClick={() => void transitionStatus(status)}
                    className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-bold text-[#334155] disabled:opacity-60"
                  >
                    Move to {storeOrderStatusLabel(status)}
                  </button>
                );
              })}

              {!isNew && canDelete && order?.status === "Draft" ? (
                <button
                  type="button"
                  onClick={() => void deleteOrder()}
                  className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700"
                >
                  Delete Draft
                </button>
              ) : null}
            </section>
          </>
        )}
      </div>
    </VyronPremiumPageShell>
  );
}
