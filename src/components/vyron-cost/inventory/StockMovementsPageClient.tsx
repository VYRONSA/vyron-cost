"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER } from "@/components/vyron-ui";
import { ItemLookupField } from "@/components/vyron-platform/item-lookup/ItemLookupField";

type StockItemOption = {
  id: string;
  item_code: string;
  description: string;
  entity_type: string;
  qty_on_hand: number;
  unit_cost: number;
  unit: string;
};

type LedgerEntry = {
  id: string;
  transaction_number: string;
  transaction_type: string;
  item_name: string;
  item_code: string;
  signed_quantity: number;
  running_balance: number;
  unit_cost: number;
  total_cost: number;
  reference_label: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

const HISTORY_LIMIT = 50;

const qtyFmt = (n: number) => Number(n || 0).toLocaleString("en-ZA", { maximumFractionDigits: 4 });
const moneyFmt = (n: number) => `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whenFmt = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });

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

  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyForItem, setHistoryForItem] = useState(false);

  const loadHistory = useCallback(async (itemId?: string) => {
    try {
      const qs = itemId ? `?stockItemId=${encodeURIComponent(itemId)}` : "";
      const response = await fetch(`/api/inventory-transactions/ledger${qs}`, { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) {
        setHistoryError(data.error || "Movement history could not be loaded.");
        return;
      }
      setHistoryError(null);
      setHistory(((data.entries || []) as LedgerEntry[]).slice(0, HISTORY_LIMIT));
    } catch {
      setHistoryError("Movement history could not be loaded.");
    }
  }, []);

  const loadItems = useCallback(async () => {
    const response = await fetch("/api/inventory-transactions/stock-items", { cache: "no-store" });
    const data = await response.json();
    if (data.ok) setItems(data.items || []);
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    void loadHistory(historyForItem && stockItemId ? stockItemId : undefined);
  }, [loadHistory, historyForItem, stockItemId]);

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
    const entered = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
    if (mode === "count" && (entered(countedQty) === null || Number(countedQty) < 0)) {
      setError("Enter the counted quantity (zero or more).");
      return;
    }
    if (mode === "adjust" && !entered(quantityDelta)) {
      setError("Enter a non-zero adjustment (+ or −).");
      return;
    }
    if ((mode === "receive" || mode === "issue") && !((entered(quantity) ?? 0) > 0)) {
      setError("Enter a quantity greater than zero.");
      return;
    }
    if (mode !== "count" && unitCost.trim() !== "" && !((entered(unitCost) ?? -1) >= 0)) {
      setError("Unit cost must be zero or more.");
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
      await Promise.all([loadItems(), loadHistory(historyForItem ? stockItemId : undefined)]);
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
                ? "border-[#1F4757] bg-[#EEF3F5] shadow-sm"
                : "border-[#E2E8F0] bg-white hover:border-[#93AEB9]"
            }`}
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Action</div>
            <div className="mt-1 text-lg font-black text-[#0B202B]">{ACTION_LABELS[action]}</div>
          </button>
        ))}
      </div>

      {mode ? (
        <section className={`${VYRON_MASTER.moduleDataSection} mt-6 space-y-4`}>
          <h2 className="text-lg font-black text-[#0B202B]">{ACTION_LABELS[mode]}</h2>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Stock Item</span>
            <ItemLookupField
              className="mt-1"
              /*
               * A stock movement posts against a stock item, so this is the one
               * picker that needs the record to exist at the moment of choosing.
               * Every other picker searches read-only.
               */
              materialise
              initialValue={selectedItem?.description || ""}
              onSelect={(item) => {
                setStockItemId(item.stockItemId);
                setUnitCost(String(item.currentCost || 0));
                // A just-materialised item is not in the list yet; reload so
                // its on-hand figure shows before anything is posted.
                if (!items.some((i) => i.id === item.stockItemId)) void loadItems();
              }}
            />
          </label>

          {selectedItem ? (
            <div className="rounded-xl bg-[#F8FAFC] px-4 py-3 text-sm text-[#64748B]">
              On hand: <strong className="text-[#0B202B]">{selectedItem.qty_on_hand}</strong> {selectedItem.unit}
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
            <div className="rounded-xl border border-[var(--vyron-success-border)] bg-[var(--vyron-success-bg)] px-4 py-3 text-sm font-semibold text-[var(--vyron-success-fg)]">
              {message}
            </div>
          ) : null}

          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="rounded-xl bg-[#1F4757] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? "Posting…" : "Post Transaction"}
          </button>
        </section>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] bg-white px-4 py-8 text-center text-sm text-[#64748B]">
          Select an action above to post a stock movement.
        </div>
      )}

      <section className={`${VYRON_MASTER.moduleDataSection} mt-6`} data-testid="stock-movement-history">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[#0B202B]">Movement history</h2>
            <p className="text-xs font-semibold text-[#64748B]">
              Latest {HISTORY_LIMIT} posted movements{historyForItem && selectedItem ? ` for ${selectedItem.description}` : ""}. Posted movements are never edited; a correction posts a new movement.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[#334155]">
            <input type="checkbox" checked={historyForItem} disabled={!stockItemId} onChange={(e) => setHistoryForItem(e.target.checked)} />
            Selected item only
          </label>
        </div>
        {historyError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{historyError}</div>
        ) : history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#E2E8F0] px-4 py-6 text-center text-sm text-[#64748B]">No stock movements posted yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748B]">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-t border-[#F1F5F9]">
                    <td className="whitespace-nowrap px-3 py-2 text-[#64748B]">{whenFmt(row.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-[#0B202B]">
                      {row.transaction_number}
                      {row.reference_label ? <div className="text-[11px] font-medium text-[#64748B]">{row.reference_label}</div> : null}
                    </td>
                    <td className="px-3 py-2">{row.transaction_type}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-[#0B202B]">{row.item_name}</div>
                      <div className="text-[11px] text-[#64748B]">{row.item_code}</div>
                    </td>
                    <td className={`px-3 py-2 text-right font-bold ${row.signed_quantity < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {row.signed_quantity > 0 ? "+" : ""}
                      {qtyFmt(row.signed_quantity)}
                    </td>
                    <td className="px-3 py-2 text-right">{qtyFmt(row.running_balance)}</td>
                    <td className="px-3 py-2 text-right">{moneyFmt(row.total_cost)}</td>
                    <td className="px-3 py-2 text-[#64748B]">{row.created_by || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </VyronPremiumPageShell>
  );
}
