"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";

type OpenPo = {
  id: string;
  po_number: string;
  supplier_name_snapshot: string;
  status: string;
  total: number;
  outstanding_amount: number;
};

type MatchInfo = {
  matchStatus: string;
  poTotal: number;
  invoiceTotal: number;
  totalVariance: number;
  qtyVariance: number;
  missingGrn: boolean;
};

export default function PoLinkPanel({
  documentId,
  supplierName,
  purchaseOrderNumber,
  onLinked,
}: {
  documentId: string;
  supplierName: string;
  purchaseOrderNumber: string;
  onLinked?: (poNumber: string) => void;
}) {
  const [openPos, setOpenPos] = useState<OpenPo[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [message, setMessage] = useState("");
  const [linked, setLinked] = useState<{ poNumber: string; supplier: string; total: number; outstanding: number } | null>(
    null
  );
  const [match, setMatch] = useState<MatchInfo | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (supplierName.trim()) params.set("supplier", supplierName.trim());
      const res = await fetch(`/api/purchase-orders/open?${params}`);
      const data = await res.json();
      if (data.ok) setOpenPos(data.orders || []);
    } catch {
      setMessage("Could not load open purchase orders.");
    } finally {
      setLoading(false);
    }
  }, [supplierName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleLink() {
    if (!selectedId) return;
    setLinking(true);
    setMessage("");
    try {
      const res = await fetch(`/api/documents/${documentId}/link-po`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseOrderId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Link failed.");
      const po = data.po;
      setLinked({
        poNumber: String(po.po_number),
        supplier: String(po.supplier_name_snapshot || ""),
        total: Number(po.total || 0),
        outstanding: Number(po.outstanding_amount || 0),
      });
      if (data.match) {
        setMatch({
          matchStatus: data.match.matchStatus,
          poTotal: data.match.poTotal,
          invoiceTotal: data.match.invoiceTotal,
          totalVariance: data.match.totalVariance,
          qtyVariance: data.match.qtyVariance,
          missingGrn: data.match.missingGrn,
        });
      }
      onLinked?.(String(po.po_number));
      setMessage(`Linked to ${po.po_number}. Match: ${data.match?.matchStatus || "—"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not link PO.");
    } finally {
      setLinking(false);
    }
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-violet-800">
        <Link2 size={14} />
        3-Way Match — Link Purchase Order
      </div>
      {purchaseOrderNumber && !linked ? (
        <p className="mt-2 text-[11px] font-semibold text-slate-600">
          Extracted PO reference: <span className="font-black text-slate-900">{purchaseOrderNumber}</span>
        </p>
      ) : null}
      {linked ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
          <div className="rounded-xl bg-white p-3">
            <div className="font-black text-slate-900">PO {linked.poNumber}</div>
            <div className="text-slate-600">{linked.supplier}</div>
            <div className="mt-1">PO total: R{linked.total.toFixed(2)}</div>
            <div>Outstanding: R{linked.outstanding.toFixed(2)}</div>
          </div>
          {match ? (
            <div className="rounded-xl bg-white p-3">
              <div className="font-black text-violet-900">{match.matchStatus}</div>
              <div className="mt-1">PO R{match.poTotal.toFixed(2)} vs Invoice R{match.invoiceTotal.toFixed(2)}</div>
              <div>Total variance: R{match.totalVariance.toFixed(2)}</div>
              <div>Qty variance: {match.qtyVariance}</div>
              {match.missingGrn ? <div className="mt-1 font-bold text-amber-700">GRN not yet received</div> : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {loading ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500">
              <Loader2 className="animate-spin" size={14} />
              Loading POs…
            </span>
          ) : (
            <select
              className="min-w-[220px] rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select purchase order…</option>
              {openPos.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.po_number} — {po.supplier_name_snapshot} (R{Number(po.total || 0).toFixed(0)})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={!selectedId || linking}
            onClick={() => void handleLink()}
            className="rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-[#F8FAFC] disabled:opacity-60"
          >
            {linking ? "Linking…" : "Link PO"}
          </button>
        </div>
      )}
      {message ? <p className="mt-2 text-[11px] font-bold text-violet-800">{message}</p> : null}
    </section>
  );
}
