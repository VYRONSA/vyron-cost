"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import {
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

type OpenPo = {
  id: string;
  po_number: string;
  supplier_name_snapshot?: string | null;
  status?: string | null;
  total?: number | null;
  outstanding_amount?: number | null;
};

type GrnLine = {
  purchase_order_line_id?: string | null;
  item_name: string;
  ordered_qty: number;
  already_received_qty: number;
  outstanding_qty: number;
  received_qty: number;
  damaged_qty: number;
  rejected_qty: number;
  unit: string;
};

function toNumber(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function poLabel(order: OpenPo) {
  return `${order.po_number || order.id} · ${order.supplier_name_snapshot || "Supplier"} · ${order.status || "Open"}`;
}

export default function GoodsReceiptFormClient({ initialPoId }: { initialPoId?: string }) {
  const router = useRouter();
  const { canCreate } = useModulePermissions("goods_receipts");
  const [openPos, setOpenPos] = useState<OpenPo[]>([]);
  const [poSearch, setPoSearch] = useState("");
  const [poId, setPoId] = useState(initialPoId || "");
  const [po, setPo] = useState<Record<string, unknown> | null>(null);
  const [lines, setLines] = useState<GrnLine[]>([]);
  const [receiptType, setReceiptType] = useState<"full" | "partial">("partial");
  const [receivedBy, setReceivedBy] = useState("Supervisor");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingPo, setLoadingPo] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const refreshOpenPos = useCallback(async (searchTerm = poSearch) => {
    const { query: workspaceQuery } = poApiWorkspaceContext();
    const params = new URLSearchParams(workspaceQuery ? workspaceQuery.slice(1) : "");
    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    const res = await fetch(`/api/purchase-orders/open?${params.toString()}`, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setOpenPos(data.purchaseOrders || data.orders || []);
  }, [poSearch]);

  useEffect(() => {
    void refreshOpenPos("");
  }, [refreshOpenPos]);

  const filteredOpenPos = useMemo(() => {
    const term = poSearch.trim().toLowerCase();
    if (!term) return openPos;
    return openPos.filter((order) => poLabel(order).toLowerCase().includes(term));
  }, [openPos, poSearch]);

  const loadPo = useCallback(async (id: string, mode: "partial" | "full" = receiptType) => {
    setErrorMessage("");
    if (!id) {
      setPo(null);
      setLines([]);
      return;
    }

    setLoadingPo(true);
    setMessage("Loading purchase order…");
    const { query } = poApiWorkspaceContext();
    const res = await fetch(`/api/purchase-orders/${id}${query}`, { cache: "no-store" });
    const data = await res.json();
    setLoadingPo(false);

    if (!data.ok) {
      setMessage("");
      setErrorMessage(data.error || "Could not load purchase order.");
      setPo(null);
      setLines([]);
      return;
    }

    const loadedPo = data.purchaseOrder as Record<string, unknown>;
    const rawLines = (loadedPo.lines || []) as Array<Record<string, unknown>>;

    const poLines = rawLines.map((line) => {
      const ordered = toNumber(line.ordered_qty || line.quantity);
      const alreadyReceived = toNumber(line.received_qty);
      const alreadyDamaged = toNumber(line.damaged_qty);
      const alreadyRejected = toNumber(line.rejected_qty);
      const calculatedOutstanding = ordered - alreadyReceived - alreadyDamaged - alreadyRejected;
      const outstanding = Math.max(0, toNumber(line.outstanding_qty || calculatedOutstanding));
      return {
        purchase_order_line_id: String(line.id),
        item_name: String(line.item_name || "Item"),
        ordered_qty: ordered,
        already_received_qty: alreadyReceived,
        outstanding_qty: outstanding,
        received_qty: mode === "full" ? outstanding : outstanding,
        damaged_qty: 0,
        rejected_qty: 0,
        unit: String(line.unit || "unit"),
      } satisfies GrnLine;
    });

    setPo(loadedPo);
    setLines(poLines);

    if (poLines.length === 0) {
      setMessage("");
      setErrorMessage(
        `${String(loadedPo.po_number || "This PO")} loaded, but it has no PO lines. Edit the PO and add lines before creating a GRN.`
      );
      return;
    }

    setMessage(`${String(loadedPo.po_number || "Purchase order")} loaded with ${poLines.length} line(s).`);
  }, [receiptType]);

  useEffect(() => {
    if (initialPoId) void loadPo(initialPoId);
  }, [initialPoId, loadPo]);

  function updateLine(index: number, patch: Partial<GrnLine>) {
    setLines((current) => current.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  }

  function setMode(mode: "full" | "partial") {
    setReceiptType(mode);
    setLines((current) =>
      current.map((line) => ({
        ...line,
        received_qty: mode === "full" ? Math.max(0, line.outstanding_qty) : line.received_qty,
      }))
    );
  }

  async function handlePost() {
    if (!canCreate) {
      setErrorMessage("You do not have permission to post goods receipts.");
      return;
    }
    setErrorMessage("");
    if (!poId || !po) {
      setMessage("Choose a purchase order before posting the GRN.");
      return;
    }
    if (lines.length === 0) {
      setErrorMessage("This PO has no lines to receive. Add PO lines first.");
      return;
    }

    const invalid = lines.find((line) => line.received_qty + line.damaged_qty + line.rejected_qty > line.outstanding_qty + 0.0001);
    if (invalid) {
      setErrorMessage(`${invalid.item_name} exceeds the outstanding quantity.`);
      return;
    }

    if (!window.confirm("Post this goods received note and update outstanding PO quantities?")) return;
    setSaving(true);
    try {
      const { body: workspaceBody } = poApiWorkspaceContext();
      const res = await fetch("/api/goods-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...workspaceBody,
          purchase_order_id: poId,
          receipt_type: receiptType,
          received_by: receivedBy,
          notes,
          lines,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "GRN failed");
      const grnId = data.grn?.id || data.id || "";
      setMessage(`Posted ${data.grnNumber || "GRN"}.`);
      router.push(grnId ? `/goods-receipts/${grnId}` : "/goods-receipts/history");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not post GRN.");
    } finally {
      setSaving(false);
    }
  }

  const totals = useMemo(() => {
    const ordered = lines.reduce((sum, line) => sum + line.ordered_qty, 0);
    const outstanding = lines.reduce((sum, line) => sum + line.outstanding_qty, 0);
    const received = lines.reduce((sum, line) => sum + line.received_qty, 0);
    const damaged = lines.reduce((sum, line) => sum + line.damaged_qty, 0);
    const rejected = lines.reduce((sum, line) => sum + line.rejected_qty, 0);
    return { ordered, outstanding, received, damaged, rejected };
  }, [lines]);

  return (
    <section className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="goods-receipt"
        badge="Premium Receiving Workspace"
        title="Goods Receiving Command Centre"
        subtitle="Link each GRN to the correct purchase order, capture accepted, damaged and rejected quantities, and protect stock accuracy before invoices arrive."
        quotes={[
          {
            label: "Receiving discipline",
            quote: "What gets received incorrectly gets costed incorrectly.",
          },
          {
            label: "Back-order control",
            quote: "Partial deliveries are not problems when the outstanding balance is visible.",
          },
        ]}
      >
        <Link href="/goods-receipts" className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white backdrop-blur-sm">
          GRN Dashboard
        </Link>
        <Link href="/purchase-orders/list" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-violet-900 shadow-lg">
          Purchase Orders
        </Link>
      </VyronPremiumHeroBanner>

      <div className="grid gap-4 lg:grid-cols-2">
        <VyronPremiumFormulaCard
          variant="light"
          eyebrow="Receipt formula"
          title="How back orders are calculated"
          formulas={[
            { label: "Outstanding Qty", formula: "Ordered qty − already received − damaged − rejected" },
            { label: "Receive Now", formula: "Quantity accepted into stock from this GRN" },
            { label: "Back Order", formula: "Outstanding qty − receive now − damaged − rejected" },
          ]}
        />
        <VyronPremiumFormulaCard
          eyebrow="Stock impact"
          title="How the GRN affects inventory"
          formulas={[
            { label: "Accepted Qty", formula: "Posted to stock ledger" },
            { label: "Damaged / Rejected", formula: "Recorded but not accepted into stock" },
            { label: "Audit Trail", formula: "GRN → PO → Stock ledger" },
          ]}
        />
      </div>

      <VyronPremiumSectionHeading
        eyebrow="Step 1"
        title="Choose the source purchase order"
        subtitle="Search the PO, select it, then confirm the quantities that arrived."
      />
      <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1.2fr_220px]">
          <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
            Search Purchase Orders
            <div className="mt-2 flex gap-2">
              <input
                className="w-full rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-violet-500"
                placeholder="Search PO number, supplier or status…"
                value={poSearch}
                onChange={(event) => setPoSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void refreshOpenPos(poSearch);
                }}
              />
              <button type="button" onClick={() => void refreshOpenPos(poSearch)} className="rounded-2xl vyron-grad-surface px-4 py-3 text-xs font-semibold text-white">
                Search
              </button>
            </div>
          </label>

          <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
            Link GRN to Purchase Order
            <select
              className="mt-2 w-full rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-violet-500"
              value={poId}
              onChange={(event) => {
                const id = event.target.value;
                setPoId(id);
                void loadPo(id);
              }}
            >
              <option value="">Choose open purchase order…</option>
              {filteredOpenPos.map((order) => (
                <option key={order.id} value={order.id}>
                  {poLabel(order)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
            Received By
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold"
              value={receivedBy}
              onChange={(event) => setReceivedBy(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("full")} className={`rounded-2xl px-4 py-3 text-xs font-black ${receiptType === "full" ? "vyron-grad-surface text-white" : "bg-violet-50 text-violet-800"}`}>
            Full Receipt
          </button>
          <button type="button" onClick={() => setMode("partial")} className={`rounded-2xl px-4 py-3 text-xs font-black ${receiptType === "partial" ? "vyron-grad-surface text-white" : "bg-violet-50 text-violet-800"}`}>
            Partial / Back Order
          </button>
          <button type="button" onClick={() => void loadPo(poId)} disabled={!poId || loadingPo} className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-xs font-black text-violet-700 disabled:opacity-60">
            Reload PO Lines
          </button>
        </div>

        {po ? (
          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm font-bold text-slate-700">
            Source PO: <Link href={`/purchase-orders/${poId}`} className="text-violet-700 underline">{String(po.po_number)}</Link> · {String(po.supplier_name_snapshot || "Supplier")} · {lines.length} line(s)
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {[
          ["Ordered", totals.ordered],
          ["Outstanding", totals.outstanding],
          ["Receiving", totals.received],
          ["Damaged", totals.damaged],
          ["Rejected", totals.rejected],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-violet-100 bg-white p-4">
            <div className="text-[10px] font-black uppercase text-violet-600">{label}</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{Number(value).toFixed(2)}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[2rem] border border-violet-100 bg-white shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <table className="min-w-[940px] w-full text-left text-sm">
          <thead className="bg-violet-800 text-xs font-black uppercase tracking-[0.14em] text-violet-100">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Ordered</th>
              <th className="px-4 py-3">Already Received</th>
              <th className="px-4 py-3">Outstanding</th>
              <th className="px-4 py-3">Receive Now</th>
              <th className="px-4 py-3">Damaged</th>
              <th className="px-4 py-3">Rejected</th>
              <th className="px-4 py-3">Unit</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center font-bold text-slate-500">Search and select a purchase order to load lines.</td></tr>
            ) : lines.map((line, index) => (
              <tr key={line.purchase_order_line_id || index} className="border-t border-slate-100">
                <td className="px-4 py-3 font-black text-slate-900">{line.item_name}</td>
                <td className="px-4 py-3">{line.ordered_qty}</td>
                <td className="px-4 py-3">{line.already_received_qty}</td>
                <td className="px-4 py-3 font-bold text-violet-700">{line.outstanding_qty}</td>
                <td className="px-4 py-3"><input type="number" min={0} max={line.outstanding_qty} className="w-28 rounded-xl border px-3 py-2 font-bold" value={line.received_qty} onChange={(event) => updateLine(index, { received_qty: toNumber(event.target.value) })} /></td>
                <td className="px-4 py-3"><input type="number" min={0} className="w-24 rounded-xl border px-3 py-2 font-bold" value={line.damaged_qty} onChange={(event) => updateLine(index, { damaged_qty: toNumber(event.target.value) })} /></td>
                <td className="px-4 py-3"><input type="number" min={0} className="w-24 rounded-xl border px-3 py-2 font-bold" value={line.rejected_qty} onChange={(event) => updateLine(index, { rejected_qty: toNumber(event.target.value) })} /></td>
                <td className="px-4 py-3">{line.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <textarea className="w-full rounded-2xl border border-[var(--vyron-success-border)] bg-white px-4 py-3 text-sm font-semibold" rows={3} placeholder="GRN notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      {message ? <p className="rounded-2xl bg-[var(--vyron-success-bg)] px-4 py-3 text-sm font-black text-[var(--vyron-success-fg)]">{message}</p> : null}
      {errorMessage ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700">{errorMessage}</p> : null}
      <div className="flex flex-wrap gap-3">
        {canCreate ? (
          <button type="button" disabled={saving || !poId || lines.length === 0} onClick={() => void handlePost()} className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-sm font-black text-[#F8FAFC] disabled:opacity-60">
            {saving ? "Posting…" : "Post Goods Receipt"}
          </button>
        ) : null}
        <Link href="/goods-receipts" className="rounded-2xl border border-violet-100 bg-white px-6 py-4 text-sm font-black text-violet-700">GRN Dashboard</Link>
      </div>
    </section>
  );
}
