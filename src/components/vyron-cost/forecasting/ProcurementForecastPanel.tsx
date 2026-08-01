"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import type { ProcurementForecastIngredientRow } from "@/lib/vyron-demand-forecasting";

function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ProcurementForecastPanel() {
  const [ingredients, setIngredients] = useState<ProcurementForecastIngredientRow[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/demand-forecast/procurement", { cache: "no-store" });
        const data = await response.json();
        if (data.ok) {
          setIngredients(data.ingredients || []);
          setTotalValue(Number(data.total_value || 0));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
        Loading procurement forecast…
      </div>
    );
  }

  return (
    <section className={VYRON_MASTER.moduleDataSection}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-black text-[#0F172A]">Procurement Forecast (BOM)</h2>
        <div className="text-sm font-bold text-[#64748B]">
          Total: <span className="text-[#0F172A]">{formatMoney(totalValue)}</span>
        </div>
      </div>
      {ingredients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E2E8F0] px-4 py-8 text-center text-sm text-[#64748B]">
          No BOM-linked ingredient requirements from current product forecasts.
        </div>
      ) : (
        <EnterpriseScrollContainer className="rounded-2xl border border-[#E2E8F0]">
          <table className="min-w-full">
            <thead className={VYRON_TABLE.head}>
              <tr>
                <th className="px-4 py-3 text-left">Ingredient</th>
                <th className="px-4 py-3 text-right">Required Qty</th>
                <th className="px-4 py-3 text-right">Unit Cost</th>
                <th className="px-4 py-3 text-right">Estimated Cost</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((row) => (
                <tr key={`${row.ingredient_id || row.ingredient_name}`} className={VYRON_TABLE.row}>
                  <td className="px-4 py-3 font-semibold">{row.ingredient_name}</td>
                  <td className="px-4 py-3 text-right text-sm">
                    {row.required_qty} {row.unit}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">{formatMoney(row.unit_cost)}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatMoney(row.estimated_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </EnterpriseScrollContainer>
      )}
    </section>
  );
}
