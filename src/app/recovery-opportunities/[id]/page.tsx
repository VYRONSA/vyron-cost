import Link from "next/link";
import RecoveryStatusClient from "@/components/RecoveryStatusClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getRecoveryOpportunityById, money } from "@/lib/vyron-cost-recovery-data";
import { getRecoveryInsightDrilldown } from "@/lib/vyron-supplier-intelligence-engine";

export default async function RecoveryOpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [opportunity, drilldown] = await Promise.all([
    getRecoveryOpportunityById(id),
    getRecoveryInsightDrilldown(id),
  ]);

  if (!opportunity) {
    return (
      <VyronCostAiShell title="Recovery Opportunity Not Found" subtitle="This opportunity could not be loaded.">
        <div className="rounded-[2rem] bg-white p-8 font-bold text-slate-600 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          Recovery opportunity not found.
        </div>
      </VyronCostAiShell>
    );
  }

  return (
    <VyronCostAiShell
      title={opportunity.title}
      subtitle="Client-explainable recovery calculation, formula, source and recommended action."
    >
      <section className="grid gap-5 md:grid-cols-6">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Type</div>
          <div className="mt-3 text-2xl font-black text-slate-900">{opportunity.opportunity_type}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Monthly</div>
          <div className="mt-3 text-4xl font-black text-violet-700">{money(opportunity.monthly_value)}</div>
        </div>
        <div className="rounded-[2rem] bg-emerald-50 p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">Annual</div>
          <div className="mt-3 text-4xl font-black text-emerald-600">{money(opportunity.annual_value)}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Recovery Confidence</div>
          <div className="mt-3 text-2xl font-black text-slate-900">{opportunity.confidence_level || "Medium Confidence"}</div>
          <div className="mt-1 text-sm font-bold text-slate-500">{Number(opportunity.confidence || 0).toFixed(0)}%</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Status</div>
          <div className="mt-3 text-2xl font-black text-violet-700">{opportunity.status || "Identified"}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Owner</div>
          <div className="mt-3 text-2xl font-black text-slate-900">{opportunity.owner_name || "Unassigned"}</div>
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-xl font-black text-slate-900">How This Is Calculated</h2>
          <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
            {opportunity.description || "This opportunity was detected from current VYRON COST data."}
          </p>

          <div className="mt-5 rounded-3xl bg-slate-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Formula</div>
            <div className="mt-2 text-lg font-black text-slate-900">
              {opportunity.formula || "Potential Recovery = Estimated avoidable monthly loss × 12"}
            </div>
          </div>

          <div className="mt-5 rounded-3xl bg-violet-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-700">Recovery Amount</div>
            <div className="mt-2 text-lg font-black text-violet-900">
              {opportunity.is_estimated ? "Estimated Recovery" : "Verified Recovery"}: {money(opportunity.monthly_value)}
            </div>
            <div className="mt-1 text-xs font-bold text-violet-800">
              Potential Recovery: {money(opportunity.potential_recovery)} · Recovered To Date: {money(opportunity.recovered_to_date)}
            </div>
          </div>

          {opportunity.formula_inputs ? (
            <div className="mt-5 rounded-3xl bg-white border border-slate-200 p-5">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Inputs Used</div>
              <div className="mt-3 grid gap-2 text-xs font-bold text-slate-700 md:grid-cols-2">
                {Object.entries(opportunity.formula_inputs).map(([key, value]) => (
                  <div key={key} className="rounded-xl bg-slate-50 px-3 py-2">
                    {key}: {typeof value === "number" ? value.toLocaleString("en-ZA", { maximumFractionDigits: 4 }) : String(value)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 rounded-3xl bg-amber-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Missing Inputs</div>
            <div className="mt-2 text-sm font-bold text-amber-900">
              {opportunity.missing_inputs?.length
                ? opportunity.missing_inputs.join(", ")
                : "No missing inputs. Formula inputs are complete."}
            </div>
          </div>

          <div className="mt-5 rounded-3xl bg-emerald-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">Recommended Action</div>
            <div className="mt-2 text-lg font-black text-emerald-900">
              {opportunity.recommended_action || "Review and investigate this opportunity."}
            </div>
          </div>

          <RecoveryStatusClient
            opportunityId={opportunity.id}
            currentStatus={opportunity.status}
            potentialRecovery={opportunity.potential_recovery || opportunity.monthly_value || 0}
          />

          {drilldown ? (
            <div className="mt-6 rounded-3xl bg-slate-50 p-5">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Drilldown</div>
              <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm font-bold text-slate-700">
                <div>Previous Price: {money(drilldown.previousPrice)}</div>
                <div>New Price: {money(drilldown.newPrice)}</div>
                <div>% Change: {drilldown.percentageChange.toFixed(2)}%</div>
                <div>Invoices: {drilldown.invoiceCount}</div>
                <div>Affected Products: {drilldown.affectedProducts.length}</div>
                <div>Recommended Action: {drilldown.recommendedAction}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <h2 className="text-xl font-black text-slate-900">Linked Records</h2>
            <div className="mt-5 space-y-3">
              {opportunity.product_name && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Product</div>
                  <div className="mt-1 font-black text-slate-900">{opportunity.product_name}</div>
                  {opportunity.product_id && (
                    <Link href={`/products/${opportunity.product_id}`} className="mt-2 inline-block text-sm font-black text-violet-700">
                      Open product →
                    </Link>
                  )}
                </div>
              )}

              {opportunity.supplier_name && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Supplier</div>
                  <div className="mt-1 font-black text-slate-900">{opportunity.supplier_name}</div>
                  {opportunity.supplier_id && (
                    <Link href={`/suppliers/${opportunity.supplier_id}`} className="mt-2 inline-block text-sm font-black text-violet-700">
                      Open supplier →
                    </Link>
                  )}
                </div>
              )}

              {opportunity.ingredient_name && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Ingredient</div>
                  <div className="mt-1 font-black text-slate-900">{opportunity.ingredient_name}</div>
                  {opportunity.ingredient_id && (
                    <Link href={`/ingredients/${opportunity.ingredient_id}`} className="mt-2 inline-block text-sm font-black text-violet-700">
                      Open ingredient →
                    </Link>
                  )}
                </div>
              )}

              {!opportunity.product_name && !opportunity.supplier_name && !opportunity.ingredient_name && (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
                  No linked record captured.
                </div>
              )}

              {opportunity.products_affected?.length ? (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Products Affected</div>
                  <div className="mt-2 space-y-2">
                    {opportunity.products_affected.slice(0, 8).map((product) => (
                      <div key={product.productId} className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700">
                        {product.productName}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <h2 className="text-xl font-black text-slate-900">Data Source</h2>
            <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
              {opportunity.data_source || "System calculation"}
            </p>
            <div className="mt-5 rounded-3xl bg-violet-50 p-5 text-sm font-bold leading-7 text-violet-900">
              This page is designed so you can explain the recovery value to a client without guessing.
            </div>

            {drilldown?.affectedProducts?.length ? (
              <div className="mt-5 rounded-3xl bg-emerald-50 p-5">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Affected Products</div>
                <div className="mt-3 space-y-2">
                  {drilldown.affectedProducts.slice(0, 6).map((product) => (
                    <div key={product.productId} className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-900">
                      {product.productName} · Cost diff {money(product.costDifference)} · GP impact {product.gpImpact.toFixed(2)}%
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
