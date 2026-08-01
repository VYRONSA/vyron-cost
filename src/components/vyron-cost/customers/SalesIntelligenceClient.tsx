"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/vyron-cost/stock-engine";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VyronPremiumSectionHeading } from "@/components/vyron-premium/VyronPremiumSprint";

type Report = {
  salesByCustomer: Array<{ customer: string; sales: number; invoices: number }>;
  salesByProduct: Array<{ product: string; sales: number }>;
  topCustomers: Array<{ customer: string; sales: number; invoices: number }>;
  topProducts: Array<{ product: string; sales: number }>;
  monthlySales: Array<{ month: string; sales: number }>;
  invoiceTrends: Array<{ invoiceNumber: string; date: string; sales: number; status: string }>;
};

export default function SalesIntelligenceClient() {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    fetch("/api/reports/sales-intelligence")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setReport(d.report);
      })
      .catch(() => setReport(null));
  }, []);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "customers",
        badge: "Premium Sales Intelligence",
        title: "Sales Intelligence Centre",
        subtitle: "Sales by customer and product, top performers, invoice trends and monthly sales velocity.",
        outcomes: [
          "Rank customers and products by sales",
          "Track monthly sales momentum",
          "Review invoice trends and status",
          "Support repricing and account planning",
        ],
        formulaTitle: "Sales formulas",
        formulas: [
          { label: "Sales Value", formula: "Σ invoice line qty × unit price" },
          { label: "GP %", formula: "(Sales − Cost) ÷ Sales × 100" },
          { label: "Monthly Sales", formula: "Σ posted invoices in calendar month" },
        ],
        intelligenceTitle: "Sales Intelligence",
        intelligenceItems: [
          { label: "Top customers", detail: "Concentration risk — a few customers can dominate margin exposure." },
          { label: "Product mix", detail: "Top products reveal where production and pricing focus should land." },
          { label: "Trends", detail: "Invoice trend lines show whether commercial momentum is improving." },
        ],
      }}
    >
      <VyronPremiumSectionHeading eyebrow="Breakdown" title="Sales by dimension" />

      <section className="grid gap-4 md:grid-cols-2">
        <ReportCard title="Sales by Customer" rows={(report?.salesByCustomer || []).map((row) => [row.customer, formatCurrency(row.sales), `${row.invoices} invoices`])} />
        <ReportCard title="Sales by Product" rows={(report?.salesByProduct || []).map((row) => [row.product, formatCurrency(row.sales), ""])} />
        <ReportCard title="Top Customers" rows={(report?.topCustomers || []).map((row) => [row.customer, formatCurrency(row.sales), `${row.invoices} invoices`])} />
        <ReportCard title="Top Products" rows={(report?.topProducts || []).map((row) => [row.product, formatCurrency(row.sales), ""])} />
      </section>

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h3 className="text-xl font-black text-slate-900">Monthly Sales</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(report?.monthlySales || []).map((row) => (
            <div key={row.month} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{row.month}</p>
              <p className="mt-2 text-2xl font-black text-violet-700">{formatCurrency(row.sales)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h3 className="text-xl font-black text-slate-900">Invoice Trends</h3>
        <EnterpriseScrollContainer className="mt-4 rounded-3xl border border-slate-100">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              <tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Sales</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(report?.invoiceTrends || []).map((row) => (
                <tr key={row.invoiceNumber}>
                  <td className="px-4 py-3 font-black text-violet-700">{row.invoiceNumber}</td>
                  <td className="px-4 py-3">{row.date}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3 text-right font-black">{formatCurrency(row.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </EnterpriseScrollContainer>
      </section>
    </VyronPremiumPageShell>
  );
}

function ReportCard({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
      <h3 className="text-xl font-black text-slate-900">{title}</h3>
      <div className="mt-4 space-y-2">
        {rows.length ? rows.map((row) => (
          <div key={row[0]} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
            <span className="font-bold text-slate-800">{row[0]}</span>
            <span className="font-black text-violet-700">{row[1]}</span>
          </div>
        )) : <p className="text-sm font-semibold text-slate-500">No data yet. Post customer invoices to populate this report.</p>}
      </div>
    </div>
  );
}
