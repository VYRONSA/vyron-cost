"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import { formatStoreOrderMoney } from "@/components/vyron-cost/store-ordering/store-order-ui";
import type { StoreProductionRunRow } from "@/lib/vyron-store-production-planning";

export default function StoreProductionRunDetailClient({ runId }: { runId: string }) {
  const [run, setRun] = useState<StoreProductionRunRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  async function loadRun() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/store-production-runs/${runId}`);
      const data = await response.json();
      if (!data.ok || !data.run) {
        setError(data.error || "Production run not found.");
        return;
      }
      setRun(data.run as StoreProductionRunRow);
    } catch {
      setError("Production run not found.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRun();
  }, [runId]);

  async function completeRun() {
    setCompleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/store-production-runs/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", completed_by: "user" }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Failed to complete production run.");
        return;
      }
      setRun(data.run as StoreProductionRunRow);
    } catch {
      setError("Failed to complete production run.");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Production Planning",
        title: run?.run_number || "Production Run",
        subtitle: run ? `${run.production_date} · ${run.status}` : "Loading…",
        outcomes: ["Product lines from consolidated store demand", "BOM ingredient requirements", "Non-blocking shortage warnings"],
      }}
      actions={
        <div className="flex flex-wrap gap-2">
          {run && run.status !== "Completed" && run.status !== "Cancelled" ? (
            <button
              type="button"
              disabled={completing}
              onClick={() => void completeRun()}
              className="rounded-xl bg-[#1D6BFF] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {completing ? "Completing…" : "Complete Run"}
            </button>
          ) : null}
          <Link href="/production-runs" className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]">
            Back to runs
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
            Loading production run…
          </div>
        ) : run ? (
          <>
            <section className={`${VYRON_MASTER.moduleDataSection} grid gap-4 md:grid-cols-3`}>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Total Cost</div>
                <div className="mt-1 text-2xl font-black">{formatStoreOrderMoney(run.total_cost)}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Products</div>
                <div className="mt-1 text-2xl font-black">{run.lines?.length || 0}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Status</div>
                <div className="mt-1 text-2xl font-black">{run.status}</div>
              </div>
            </section>

            <section className={VYRON_MASTER.moduleDataSection}>
              <h2 className="mb-4 text-lg font-black text-[#0F172A]">Product Lines</h2>
              <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
                <table className="min-w-full">
                  <thead className={VYRON_TABLE.head}>
                    <tr>
                      <th className="px-4 py-3 text-left">Product</th>
                      <th className="px-4 py-3 text-right">Required</th>
                      <th className="px-4 py-3 text-right">Planned</th>
                      <th className="px-4 py-3 text-right">Produced</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-left">Stores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(run.lines || []).map((line) => (
                      <tr key={line.id} className={VYRON_TABLE.row}>
                        <td className="px-4 py-3 font-semibold">{line.product_name}</td>
                        <td className="px-4 py-3 text-right text-sm">{line.required_qty}</td>
                        <td className="px-4 py-3 text-right text-sm">{line.planned_qty}</td>
                        <td className="px-4 py-3 text-right text-sm">{line.produced_qty}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold">{formatStoreOrderMoney(line.total_cost)}</td>
                        <td className="px-4 py-3 text-sm text-[#64748B]">
                          {line.store_contributions.map((s) => `${s.store_name} (${s.quantity})`).join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={VYRON_MASTER.moduleDataSection}>
              <h2 className="mb-4 text-lg font-black text-[#0F172A]">Required Ingredients</h2>
              <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
                <table className="min-w-full">
                  <thead className={VYRON_TABLE.head}>
                    <tr>
                      <th className="px-4 py-3 text-left">Ingredient</th>
                      <th className="px-4 py-3 text-right">Required</th>
                      <th className="px-4 py-3 text-right">In Stock</th>
                      <th className="px-4 py-3 text-right">Shortfall</th>
                      <th className="px-4 py-3 text-left">Warning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(run.ingredient_requirements || []).map((row) => (
                      <tr key={`${row.ingredient_id || row.ingredient_name}`} className={VYRON_TABLE.row}>
                        <td className="px-4 py-3 font-semibold">{row.ingredient_name}</td>
                        <td className="px-4 py-3 text-right text-sm">{row.required_qty} {row.unit}</td>
                        <td className="px-4 py-3 text-right text-sm">{row.available_qty} {row.unit}</td>
                        <td className="px-4 py-3 text-right text-sm">{row.shortfall} {row.unit}</td>
                        <td className="px-4 py-3">
                          {row.has_shortage ? (
                            <span className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-fuchsia-800">
                              Shortage Warning
                            </span>
                          ) : (
                            "OK"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </VyronPremiumPageShell>
  );
}
