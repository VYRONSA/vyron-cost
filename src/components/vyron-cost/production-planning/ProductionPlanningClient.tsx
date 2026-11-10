"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import { formatStoreOrderMoney } from "@/components/vyron-cost/store-ordering/store-order-ui";
import { useManufacturingPermissions } from "@/hooks/useModulePermissions";
import ProductionScheduleSection from "@/components/vyron-cost/production-planning/ProductionScheduleSection";
import type {
  ConsolidatedDemandRow,
  IngredientRequirementRow,
} from "@/lib/vyron-store-production-planning";

export default function ProductionPlanningClient() {
  const router = useRouter();
  const { canCreate } = useManufacturingPermissions();
  const [demand, setDemand] = useState<ConsolidatedDemandRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRequirementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requiredFrom, setRequiredFrom] = useState("");
  const [requiredTo, setRequiredTo] = useState("");
  const [plannedDate, setPlannedDate] = useState(() => new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10));
  const [scheduleVersion, setScheduleVersion] = useState(0);

  const loadPlan = useCallback(async (from = "", to = "") => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const response = await fetch(`/api/production-planning/demand${qs.toString() ? `?${qs}` : ""}`);
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Could not generate production plan.");
        return;
      }
      setDemand((data.demand || []) as ConsolidatedDemandRow[]);
      setIngredients((data.ingredients || []) as IngredientRequirementRow[]);
      setMessage(from || to ? `Production plan generated from approved store orders required ${from || "…"} to ${to || "…"}.` : "Production plan generated from approved store orders.");
    } catch {
      setError("Could not generate production plan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadPlan(), 0);
    return () => clearTimeout(t);
  }, [loadPlan]);

  async function createProductionRun() {
    if (!canCreate || !demand.length) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/store-production-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: demand, production_date: plannedDate }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Create production run failed.");
        return;
      }
      setScheduleVersion((v) => v + 1);
      router.push(`/production-runs/${data.run.id}`);
    } catch {
      setError("Create production run failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Production Planning",
        title: "Production Plan",
        subtitle: "Consolidate store order demand into production requirements.",
        outcomes: [
          "Aggregate Approved, Picking and Ready for Dispatch orders",
          "Link finished goods to BOM ingredient requirements",
          "Surface raw material shortages without blocking",
        ],
      }}
      actions={
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1 text-xs font-bold text-[#334155]">
            Required from
            <input type="date" value={requiredFrom} onChange={(e) => setRequiredFrom(e.target.value)} className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm" />
          </label>
          <label className="flex items-center gap-1 text-xs font-bold text-[#334155]">
            to
            <input type="date" value={requiredTo} onChange={(e) => setRequiredTo(e.target.value)} className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm" />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadPlan(requiredFrom, requiredTo)}
            className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]"
          >
            Generate Plan
          </button>
          {canCreate ? (
            <label className="flex items-center gap-1 text-xs font-bold text-[#334155]">
              Planned production date
              <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm" data-testid="planned-production-date" />
            </label>
          ) : null}
          {canCreate ? (
            <button
              type="button"
              disabled={saving || !demand.length}
              onClick={() => void createProductionRun()}
              className={`${VYRON_MASTER.primaryBtn} px-4 py-2.5 text-sm disabled:opacity-60`}
            >
              {saving ? "Creating…" : "Create Production Run"}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-6">
        {message ? (
          <div className="rounded-2xl border border-[var(--vyron-success-border)] bg-[var(--vyron-success-bg)] px-4 py-3 text-sm font-semibold text-[var(--vyron-success-fg)]">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className={VYRON_MASTER.moduleDataSection}>
          <h2 className="mb-4 text-lg font-black text-[#0B202B]">Consolidated Product Demand</h2>
          <EnterpriseScrollContainer className="rounded-2xl border border-[#E2E8F0]">
            <table className="min-w-full">
              <thead className={VYRON_TABLE.head}>
                <tr>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Required by</th>
                  <th className="px-4 py-3 text-right">Orders</th>
                  <th className="px-4 py-3 text-right">Required Qty</th>
                  <th className="px-4 py-3 text-right">Planned Qty</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-left">Stores Contributing</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      Generating plan…
                    </td>
                  </tr>
                ) : demand.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      No production demand from store orders{requiredFrom || requiredTo ? " required in this date range" : ""}.
                    </td>
                  </tr>
                ) : (
                  demand.map((row) => (
                    <tr key={row.product_id} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                      <td className="px-4 py-3 font-semibold text-[#0B202B]">{row.product_name}</td>
                      <td className="px-4 py-3 text-sm">{row.required_date || <span className="text-[#94A3B8]">not stated</span>}</td>
                      <td className="px-4 py-3 text-right text-sm">{row.order_count ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-sm">{row.required_qty}</td>
                      <td className="px-4 py-3 text-right text-sm">{row.planned_qty}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold">{formatStoreOrderMoney(row.total_cost)}</td>
                      <td className="px-4 py-3 text-sm text-[#334155]">
                        {row.store_contributions
                          .map((store) => `${store.store_name} (${store.quantity}${store.required_date ? `, by ${store.required_date}` : ""})`)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </EnterpriseScrollContainer>
        </section>

        <section className={VYRON_MASTER.moduleDataSection}>
          <h2 className="mb-4 text-lg font-black text-[#0B202B]">Required Ingredients (BOM)</h2>
          <EnterpriseScrollContainer className="rounded-2xl border border-[#E2E8F0]">
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
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      Loading ingredients…
                    </td>
                  </tr>
                ) : ingredients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      No BOM ingredient requirements found.
                    </td>
                  </tr>
                ) : (
                  ingredients.map((row) => (
                    <tr key={`${row.ingredient_id || row.ingredient_name}`} className={VYRON_TABLE.row}>
                      <td className="px-4 py-3 font-semibold text-[#0B202B]">{row.ingredient_name}</td>
                      <td className="px-4 py-3 text-right text-sm">
                        {row.required_qty} {row.unit}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {row.available_qty} {row.unit}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">{row.shortfall} {row.unit}</td>
                      <td className="px-4 py-3">
                        {row.has_shortage ? (
                          <span className="rounded-full bg-[var(--vyron-warning-bg)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[var(--vyron-warning-fg)]">
                            Shortage Warning
                          </span>
                        ) : (
                          <span className="text-xs text-[#64748B]">OK</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </EnterpriseScrollContainer>
        </section>

        <ProductionScheduleSection key={scheduleVersion} canEdit={canCreate} />

        <p className="text-sm text-[#64748B]">
          Source orders: Approved, Picking, Ready for Dispatch. &quot;Required by&quot; is the earliest required date on the store orders; the date filter uses it.{" "}
          <Link href="/production-runs" className="font-semibold text-[#334155] underline">
            View production runs
          </Link>
        </p>
      </div>
    </VyronPremiumPageShell>
  );
}
