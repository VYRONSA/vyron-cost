"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";
import {
  VyronPremiumEmptyState,
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

type Item = {
  id: string;
  entity_id: string | null;
  product_id: string | null;
  item_code: string;
  description: string;
  qty_on_hand: number;
  average_cost: number;
  inventory_value: number;
  unit: string;
  stock_status: string;
};

export default function FinishedGoodsDashboardClient() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    fetch("/api/production/finished-goods")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setItems(d.items);
      });
  }, []);

  const totalValue = items.reduce((s, i) => s + i.inventory_value, 0);

  return (
    <section className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="inventory"
        badge="Premium Manufacturing Workspace"
        title="Finished Goods Command Centre"
        subtitle="Finished goods inventory value, on-hand quantities and weighted average cost — updated when production runs complete."
        outcomes={[
          "See total finished goods inventory value",
          "Drill into stock detail per product",
          "Link back to product costing and BOM",
          "Monitor stock status and movement risk",
        ]}
        quotes={[
          { label: "Inventory", quote: "Inventory is cash wearing a disguise." },
          { label: "Production", quote: "What gets measured gets protected." },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <VyronPremiumFormulaCard
          eyebrow="Valuation"
          title="Finished goods formulas"
          formulas={[
            { label: "FG Value", formula: "On-hand qty × weighted average unit cost" },
            { label: "Output Cost", formula: "Ingredient + packaging + labour + overhead per batch" },
            { label: "Unit Cost", formula: "Batch cost ÷ actual yield quantity" },
          ]}
        />
        <div className="relative overflow-hidden rounded-[2rem] bg-[#07110d] p-8 text-white shadow-[0_24px_60px_rgba(6,20,14,0.28)]">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#A855F7]">Total finished goods value</div>
          <div className="mt-2 text-4xl font-black">{formatMoney(totalValue)}</div>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">Linked to inventory module — updated on each completed production run.</p>
        </div>
      </div>

      <VyronPremiumSectionHeading eyebrow="Stock register" title="Finished goods on hand" subtitle="Open stock detail or product costing from any row." />

      {items.length === 0 ? (
        <VyronPremiumEmptyState
          steps={[
            "Create products and link them to BOMs.",
            "Run a production batch and complete the run.",
            "Post finished goods output to inventory.",
            "Return here to review on-hand value and status.",
          ]}
        />
      ) : (
        <EnterpriseScrollContainer className="rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="bg-violet-50 text-left text-xs font-black uppercase text-violet-800">
                <th className="px-5 py-4">Product</th>
                <th className="px-5 py-4">On hand</th>
                <th className="px-5 py-4">Avg cost</th>
                <th className="px-5 py-4">Inventory value</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t font-semibold">
                  <td className="px-5 py-4">
                    <div className="font-black">{item.description}</div>
                    <div className="text-xs text-slate-500">{item.item_code}</div>
                  </td>
                  <td className="px-5 py-4">
                    {item.qty_on_hand} {item.unit}
                  </td>
                  <td className="px-5 py-4">{formatMoney(item.average_cost)}</td>
                  <td className="px-5 py-4 font-black">{formatMoney(item.inventory_value)}</td>
                  <td className="px-5 py-4">{item.stock_status}</td>
                  <td className="px-5 py-4">
                    <Link href={`/inventory/stock/${item.id}`} className="text-xs font-black text-violet-700">
                      Stock detail
                    </Link>
                    {item.product_id ? (
                      <Link href={`/products/${item.product_id}/edit`} className="ml-3 text-xs font-black text-[#7E22CE]">
                        Open maintenance
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EnterpriseScrollContainer>
      )}
    </section>
  );
}
