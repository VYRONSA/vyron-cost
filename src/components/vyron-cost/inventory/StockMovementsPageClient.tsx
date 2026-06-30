"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER } from "@/components/vyron-ui";

type StockItemOption = {
  id: string;
  item_code: string;
  description: string;
  entity_type: string;
  qty_on_hand: number;
  unit_cost: number;
  unit: string;
};

type ActionMode = "receive" | "issue" | "adjust" | "count";

const ACTION_LABELS: Record<ActionMode, string> = {
  receive: "Receive Stock",
  issue: "Issue Stock",
  adjust: "Adjust Stock",
  count: "Stock Count",
};

export default function StockMovementsPageClient() {
  const [items, setItems] = useState<StockItemOption[]>([]);
  const [mode, setMode] = useState<ActionMode | null>(null);
  const [stockItemId, setStockItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quantityDelta, setQuantityDelta] = useState("");
  const [countedQty, setCountedQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    const response = await fetch("/api/inventory-transactions/stock-items", { cache: "no-store" });
    const data = await response.json();
    if (data.ok) setItems(data.items || []);
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const selectedItem = items.find((item) => item.id === stockItemId);

  useEffect(() => {
    if (selectedItem && !unitCost) {
      setUnitCost(String(selectedItem.unit_cost || 0));
    }
  }, [selectedItem, unitCost]);

  async function submit() {
    if (!mode || !stockItemId) {
      setError("Select a stock item.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const payload: Record<string, unknown> = {
        stock_item_id: stockItemId,
        notes: notes || undefined,
        created_by: "user",
      };

      if (mode === "receive") {
        payload.action = "receive";
        payload.quantity = Number(quantity);
        payload.unit_cost = Number(unitCost || selectedItem?.unit_cost || 0);
      } else if (mode === "issue") {
        payload.action = "issue";
        payload.quantity = Number(quantity);
        payload.unit_cost = Number(unitCost || selectedItem?.unit_cost || 0);
        payload.allow_negative = true;
      } else if (mode === "adjust") {
        payload.action = "adjust";
        payload.quantity_delta = Number(quantityDelta);
        payload.unit_cost = Number(unitCost || selectedItem?.unit_cost || 0);
      } else if (mode === "count") {
        payload.action = "count";
        payload.counted_qty = Number(countedQty);
      }

      const response = await fetch("/api/inventory-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Transaction failed.");
        return;
      }

      setMessage(`Transaction posted: ${data.transaction?.transaction_number || "success"}`);
      setQuantity("");
      setQuantityDelta("");
      setCountedQty("");
      setNotes("");
      await loadItems();
    } catch {
      setError("Transaction failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Inventory Intelligence",
        title: "Stock Movements",
        subtitle: "Receive, issue, adjust, and count stock through the transaction engine.",
        outcomes: [
          "Every movement creates an auditable transaction",
          "Stock levels update automatically",
          "Integrated with production and dispatch",
        ],
      }}
      actions={
        <Link href="/inventory-ledger" className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]">
          View Ledger
        </Link>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(ACTION_LABELS) as ActionMode[]).map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => setMode(action)}
            className={`rounded-2xl border px-4 py-5 text-left transition ${
              mode === action
                ? "border-[#7C3AED] bg-[#F5F3FF] shadow-sm"
                : "border-[#E2E8F0] bg-white hover:border-[#C4B5FD]"
            }`}
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Action</div>
            <div className="mt-1 text-lg font-black text-[#0F172A]">{ACTION_LABELS[action]}</div>
          </button>
        ))}
      </div>

      {mode ? (
        <section className={`${VYRON_MASTER.moduleDataSection} mt-6 space-y-4`}>
          <h2 className="text-lg font-black text-[#0F172A]">{ACTION_LABELS[mode]}</h2>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Stock Item</span>
            <select
              className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
              value={stockItemId}
              onChange={(e) => setStockItemId(e.target.value)}
            >
              <option value="">Select item…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.description} ({item.qty_on_hand} {item.unit})
                </option>
              ))}
            </select>
          </label>

          {selectedItem ? (
            <div className="rounded-xl bg-[#F8FAFC] px-4 py-3 text-sm text-[#64748B]">
              On hand: <strong className="text-[#0F172A]">{selectedItem.qty_on_hand}</strong> {selectedItem.unit}
            </div>
          ) : null}

          {mode === "count" ? (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Counted Quantity</span>
              <input
                type="number"
                step="any"
                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                value={countedQty}
                onChange={(e) => setCountedQty(e.target.value)}
              />
            </label>
          ) : mode === "adjust" ? (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Adjustment (+/−)</span>
              <input
                type="number"
                step="any"
                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                value={quantityDelta}
                onChange={(e) => setQuantityDelta(e.target.value)}
                placeholder="e.g. -2.5 or +10"
              />
            </label>
          ) : (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Quantity</span>
              <input
                type="number"
                step="any"
                min="0"
                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
          )}

          {mode !== "count" ? (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Unit Cost</span>
              <input
                type="number"
                step="any"
                min="0"
                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Notes</span>
            <textarea
              className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {message}
            </div>
          ) : null}

          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="rounded-xl bg-[#7C3AED] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? "Posting…" : "Post Transaction"}
          </button>
        </section>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] bg-white px-4 py-8 text-center text-sm text-[#64748B]">
          Select an action above to post a stock movement.
        </div>
      )}
    </VyronPremiumPageShell>
  );
}
