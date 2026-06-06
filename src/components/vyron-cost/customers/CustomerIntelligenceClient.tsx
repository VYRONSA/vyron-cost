"use client";

import { formatCurrency } from "@/lib/vyron-cost/stock-engine";

const customers = [
  { name: "Local Café Group", revenue: 128500, cogs: 74120, gp: 54380, gpPct: 42.3, frequency: "Weekly", topProduct: "Beef Pie" },
  { name: "Farmstall Foods", revenue: 94200, cogs: 57930, gp: 36270, gpPct: 38.5, frequency: "Weekly", topProduct: "Chicken Pie" },
  { name: "Corporate Canteen Supplies", revenue: 76800, cogs: 42150, gp: 34650, gpPct: 45.1, frequency: "Fortnightly", topProduct: "Cheese Pie" },
  { name: "School Tuckshop Network", revenue: 55200, cogs: 33540, gp: 21660, gpPct: 39.2, frequency: "Monthly", topProduct: "Pepper Steak Pie" },
];

export default function CustomerIntelligenceClient() {
  const revenue = customers.reduce((sum, customer) => sum + customer.revenue, 0);
  const gp = customers.reduce((sum, customer) => sum + customer.gp, 0);
  const gpPct = revenue ? (gp / revenue) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Revenue" value={formatCurrency(revenue)} />
        <Metric title="Gross Profit" value={formatCurrency(gp)} />
        <Metric title="GP %" value={`${gpPct.toFixed(1)}%`} />
        <Metric title="Top Customer" value="Local Café Group" />
      </div>

      <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.10)]">
        <h2 className="text-xl font-black text-slate-950">Customer GP Intelligence</h2>
        <p className="mt-1 text-sm font-medium text-slate-600">Revenue, COGS, gross profit and purchase behaviour from customer invoices.</p>

        <div className="mt-5 space-y-3">
          {customers.map((customer) => (
            <div key={customer.name} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_0.8fr_1fr] items-center gap-3 rounded-3xl border border-slate-100 bg-white px-4 py-4 text-sm shadow-sm">
              <div className="font-black text-slate-950">{customer.name}</div>
              <div className="text-right font-black">{formatCurrency(customer.revenue)}</div>
              <div className="text-right font-bold">{formatCurrency(customer.cogs)}</div>
              <div className="text-right font-black text-emerald-700">{formatCurrency(customer.gp)}</div>
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
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_16px_50px_rgba(76,29,149,0.10)]"><p className="text-xs font-black uppercase tracking-[0.18em] text-purple-700">{title}</p><p className="mt-3 truncate text-2xl font-black text-slate-950">{value}</p></div>;
}
