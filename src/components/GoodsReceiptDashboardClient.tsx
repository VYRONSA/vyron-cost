"use client";

import Link from "next/link";
import { Mail, Printer, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import {
  VyronPremiumEmptyState,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

type ReceiptRow = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "");
}

export default function GoodsReceiptDashboardClient() {
  const { canCreate } = useModulePermissions("goods_receipts");
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  async function loadReceipts() {
    setMessage("");
    try {
      const { query } = poApiWorkspaceContext();
      const res = await fetch(`/api/goods-receipts${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not load goods receipts.");
      setReceipts(data.receipts || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load goods receipts.");
    }
  }

  useEffect(() => {
    void loadReceipts();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return receipts.slice(0, 12);
    return receipts
      .filter((row) =>
        [
          row.grn_number,
          row.po_number,
          row.supplier_name_snapshot,
          row.receipt_type,
          row.status,
          row.received_by,
          row.notes,
        ]
          .map(text)
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 25);
  }, [receipts, search]);

  function emailSummary() {
    const subject = encodeURIComponent("VYRON COST GRN summary");
    const body = encodeURIComponent(
      filtered
        .map((row) => `${text(row.grn_number || row.id)} · ${text(row.supplier_name_snapshot)} · ${text(row.receipt_type)} · ${text(row.received_at).slice(0, 10)}`)
        .join("\n") || "No GRNs found."
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  const grnActions = (
    <>
      {canCreate ? (
        <Link href="/goods-receipts/new" className="rounded-xl border border-[#A3E635]/30 bg-[#24183F] px-5 py-3 text-sm font-semibold text-[#F8FAFC]">
          New GRN
        </Link>
      ) : null}
      <Link href="/goods-receipts/history" className="rounded-xl border border-white/10 bg-[#21163A] px-5 py-3 text-sm font-semibold text-[#CBD5E1]">
        GRN History
      </Link>
      <Link href="/purchase-orders/back-orders" className="rounded-xl border border-orange-400/30 bg-orange-500/15 px-5 py-3 text-sm font-semibold text-orange-200">
        Back Orders
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#21163A] px-5 py-3 text-sm font-semibold text-[#CBD5E1]"
      >
        <Printer size={16} /> Print
      </button>
      <button
        type="button"
        onClick={emailSummary}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#21163A] px-5 py-3 text-sm font-semibold text-[#CBD5E1]"
      >
        <Mail size={16} /> Email
      </button>
    </>
  );

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "goods-receipt",
        badge: "Premium Receipt Workspace",
        title: "Goods Receipt Control",
        subtitle: "Receive goods from a PO, review linked GRNs, print, email and open back orders — every receipt updates stock and procurement truth.",
        controlTitle: "Goods Receipt Control",
        formulaEyebrow: "Receipt flow",
        formulaTitle: "From PO to stock",
        formulas: [
          { label: "Qty Received", formula: "Accepted qty per PO line (may be partial)" },
          { label: "Back Order", formula: "Ordered qty − Cumulative received qty" },
          { label: "Stock Post", formula: "Received qty × PO unit cost → weighted average" },
        ],
        intelligenceEyebrow: "Match signals",
        intelligenceTitle: "Procurement integrity",
        intelligenceItems: [
          { label: "PO Value", detail: "Σ line qty × unit price — the commitment before goods arrive." },
          { label: "GRN Value", detail: "Σ received qty × PO unit cost — what actually hit stock." },
          { label: "Variance", detail: "Invoice total − GRN value — catch overbilling before payment." },
        ],
      }}
      actions={grnActions}
      showSpotlight={false}
    >
      <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)] print:hidden">
        <VyronPremiumSectionHeading
          eyebrow="Search"
          title="Recent receipts"
          subtitle="Filter by GRN number, supplier, PO, receiver or status."
        />

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
          <Search size={18} className="text-violet-700" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search GRN number, supplier, PO, receiver or status…"
            className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
          />
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700">{filtered.length} shown</span>
        </div>
      </div>

      {message ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">{message}</p> : null}

      <div className="overflow-x-auto rounded-[2rem] border border-violet-100 bg-white shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="bg-[#2a2448] text-xs font-bold uppercase tracking-[0.12em] text-[#94A3B8]">
            <tr>
              <th className="px-4 py-3">GRN</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Source PO</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6">
                  <div className="mx-auto max-w-lg text-left">
                    <VyronPremiumEmptyState
                      steps={[
                        "Create and approve a purchase order.",
                        "Open New GRN and select the source PO.",
                        "Record quantities received and post to stock.",
                        "Return here to review receipts and variances.",
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const id = text(row.id);
              const poId = text(row.purchase_order_id);
              return (
                <tr key={id} className="border-t border-slate-100 hover:bg-violet-50/50">
                  <td className="px-4 py-3 font-black text-violet-700">
                    <Link href={`/goods-receipts/${id}`}>{text(row.grn_number || id)}</Link>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-700">{text(row.supplier_name_snapshot || "Supplier")}</td>
                  <td className="px-4 py-3">
                    {poId ? <Link href={`/purchase-orders/${poId}`} className="font-black text-violet-700">Open PO</Link> : "—"}
                  </td>
                  <td className="px-4 py-3">{text(row.receipt_type || "receipt")}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">{text(row.status || "Posted")}</td>
                  <td className="px-4 py-3">{text(row.received_at).slice(0, 16) || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/goods-receipts/${id}`} className="rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Open →</Link>
                      {poId && canCreate ? <Link href={`/goods-receipts/new?po=${poId}`} className="rounded-full bg-fuchsia-50 px-3 py-2 text-xs font-black text-fuchsia-700">Receive balance</Link> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </VyronPremiumPageShell>
  );
}
