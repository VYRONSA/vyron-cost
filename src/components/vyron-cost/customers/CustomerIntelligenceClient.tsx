"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/vyron-cost/stock-engine";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { VyronPremiumEmptyState, VyronPremiumSectionHeading } from "@/components/vyron-premium/VyronPremiumSprint";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

type CustomerRow = {
  name: string;
  revenue: number;
  cogs: number;
  gp: number;
  gpPct: number;
  frequency: string;
  topProduct: string;
};

const demoCustomers: CustomerRow[] = [
  { name: "Local Café Group", revenue: 128500, cogs: 74120, gp: 54380, gpPct: 42.3, frequency: "Weekly", topProduct: "Beef Pie" },
  { name: "Farmstall Foods", revenue: 94200, cogs: 57930, gp: 36270, gpPct: 38.5, frequency: "Weekly", topProduct: "Chicken Pie" },
  { name: "Corporate Canteen Supplies", revenue: 76800, cogs: 42150, gp: 34650, gpPct: 45.1, frequency: "Fortnightly", topProduct: "Cheese Pie" },
  { name: "School Tuckshop Network", revenue: 55200, cogs: 33540, gp: 21660, gpPct: 39.2, frequency: "Monthly", topProduct: "Pepper Steak Pie" },
];

export default function CustomerIntelligenceClient() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);

  useEffect(() => {
    setCustomers(isDemoWorkspace(readActiveClient()) ? demoCustomers : []);
  }, []);

  const revenue = customers.reduce((sum, customer) => sum + customer.revenue, 0);
  const gp = customers.reduce((sum, customer) => sum + customer.gp, 0);
  const gpPct = revenue ? (gp / revenue) * 100 : 0;
  const topCustomer = customers[0]?.name ?? "—";

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "customers",
        badge: "Premium Sales Intelligence",
        title: "Customer Intelligence Hub",
        subtitle: "Revenue, COGS, gross profit and purchase behaviour from customer invoices — ranked for commercial action.",
        outcomes: [
          "See total revenue and portfolio GP %",
          "Rank customers by margin contribution",
          "Identify top products per customer",
          "Act on AI repricing recommendations",
        ],
        formulaTitle: "Customer margin formulas",
        formulas: [
          { label: "GP %", formula: "(Revenue − COGS) ÷ Revenue × 100" },
          { label: "Customer GP", formula: "Σ invoice sales − Σ invoice cost" },
          { label: "Avg Order Value", formula: "Customer revenue ÷ invoice count" },
        ],
        intelligenceTitle: "Margin Intelligence",
        intelligenceItems: [
          { label: "GP benchmark", detail: "Customers below portfolio GP need repricing or cost review." },
          { label: "Product mix", detail: "Top products per customer reveal where margin is won or lost." },
          { label: "Frequency", detail: "Order cadence affects production planning and working capital." },
        ],
      }}
    >
      {customers.length === 0 ? (
        <VyronPremiumEmptyState
          steps={[
            "Create customers in the Customer Relationship Centre.",
            "Raise and post customer invoices with cost lines.",
            "Link finished goods with accurate unit costs.",
            "Return here for revenue and GP intelligence.",
          ]}
        />
      ) : null}

      <VyronPremiumSectionHeading eyebrow="Portfolio" title="Customer intelligence snapshot" />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Revenue" value={formatCurrency(revenue)} />
        <Metric title="Gross Profit" value={formatCurrency(gp)} />
        <Metric title="GP %" value={`${gpPct.toFixed(1)}%`} />
        <Metric title="Top Customer" value={topCustomer} />
      </div>

      {customers.length > 0 ? (
        <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <VyronPremiumSectionHeading
            eyebrow="Detail"
            title="Customer GP intelligence"
            subtitle="Revenue, COGS, gross profit and purchase behaviour from customer invoices."
          />

          <div className="mt-5 space-y-3">
            {customers.map((customer) => (
              <div key={customer.name} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_0.8fr_1fr] items-center gap-3 rounded-3xl border border-slate-100 bg-white px-4 py-4 text-sm shadow-sm">
                <div className="font-black text-slate-950">{customer.name}</div>
                <div className="text-right font-black">{formatCurrency(customer.revenue)}</div>
                <div className="text-right font-bold">{formatCurrency(customer.cogs)}</div>
                <div className="text-right font-black text-[#65A30D]">{formatCurrency(customer.gp)}</div>
                <div className="text-right font-black">{customer.gpPct}%</div>
                <div className="font-bold text-purple-700">{customer.topProduct}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl bg-purple-50 p-5 text-sm font-semibold leading-6 text-purple-950">AI Recommendation: Local Café Group has strong weekly demand. Consider volume discount tied to minimum order quantity while protecting GP above 40%.</div>
            <div className="rounded-3xl bg-slate-950 p-5 text-sm font-semibold leading-6 text-white">Risk Watch: Farmstall Foods GP is below benchmark. Review chicken and packaging price increases before the next quote.</div>
          </div>
        </div>
      ) : null}
    </VyronPremiumPageShell>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[2rem] border border-violet-100 bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
      <div className="text-xs font-black uppercase tracking-[0.12em] text-violet-600">{title}</div>
      <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
    </div>
  );
}
