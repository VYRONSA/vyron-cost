"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function GoodsReceiptHistoryPage() {
  const [receipts, setReceipts] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetch("/api/goods-receipts")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setReceipts(d.receipts || []);
      });
  }, []);

  return (
    <VyronCostAiShell title="GRN History" subtitle="All posted goods received notes">
      <section className="rounded-[2rem] border border-violet-100 bg-white p-6">
        <Link href="/goods-receipts" className="text-xs font-black text-violet-700">
          ← GRN Dashboard
        </Link>
        <div className="mt-4 space-y-2">
          {receipts.map((r) => (
            <Link
              key={String(r.id)}
              href={`/goods-receipts/${r.id}`}
              className="block rounded-xl border p-4 text-sm transition hover:bg-violet-50"
            >
              <div className="font-black">{String(r.grn_number)}</div>
              <div className="text-slate-600">
                {String(r.supplier_name_snapshot)} · {String(r.receipt_type)} · {String(r.received_at || "").slice(0, 16)}
              </div>
              <div className="text-xs text-slate-500">PO: {String((r.vyron_cost_purchase_orders as { po_number?: string })?.po_number || r.purchase_order_id)}</div>
            </Link>
          ))}
        </div>
      </section>
    </VyronCostAiShell>
  );
}
