"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import { formatStoreOrderMoney } from "@/components/vyron-cost/store-ordering/store-order-ui";
import { STORE_PRODUCTION_STATUSES, type StoreProductionRunRow } from "@/lib/vyron-store-production-planning";

function statusClass(status: string) {
  switch (status) {
    case "Draft":
      return "bg-slate-100 text-slate-700";
    case "Planned":
      return "bg-sky-100 text-sky-800";
    case "Released":
      return "bg-violet-100 text-violet-800";
    case "Completed":
      return "bg-emerald-100 text-emerald-800";
    case "Cancelled":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function StoreProductionRunsClient() {
  const [runs, setRuns] = useState<StoreProductionRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/store-production-runs");
        const data = await response.json();
        if (!data.ok) {
          setError(data.error || "Could not load production runs.");
          return;
        }
        setRuns((data.runs || []) as StoreProductionRunRow[]);
      } catch {
        setError("Could not load production runs.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Production Planning",
        title: "Production Runs",
        subtitle: "Store-order-driven production runs with BOM-linked requirements.",
        outcomes: [
          "Track draft through completed planning runs",
          "View product lines and total planned cost",
          "Review ingredient shortages per run",
        ],
      }}
      actions={
        <Link
          href="/production-planning"
          className={`${VYRON_MASTER.primaryBtn} px-4 py-2.5 text-sm`}
        >
          Generate Plan
        </Link>
      }
    >
      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className={VYRON_MASTER.moduleDataSection}>
          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
            <table className="min-w-full">
              <thead className={VYRON_TABLE.head}>
                <tr>
                  <th className="px-4 py-3 text-left">Run Number</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Products</th>
                  <th className="px-4 py-3 text-right">Total Cost</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      Loading production runs…
                    </td>
                  </tr>
                ) : runs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      No production runs yet. Generate a plan first.
                    </td>
                  </tr>
                ) : (
                  runs.map((run) => (
                    <tr key={run.id} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                      <td className="px-4 py-3 font-bold text-[#0F172A]">{run.run_number}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{run.production_date}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusClass(run.status)}`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {Number((run as StoreProductionRunRow & { product_count?: number }).product_count || 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold">
                        {formatStoreOrderMoney(run.total_cost)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/production-runs/${run.id}`}
                          className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-bold text-[#334155]"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#64748B]">
            Statuses: {STORE_PRODUCTION_STATUSES.join(" · ")}
          </p>
        </section>
      </div>
    </VyronPremiumPageShell>
  );
}
