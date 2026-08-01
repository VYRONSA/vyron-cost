"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/vyron-cost/stock-engine";
import { buildMailtoLink } from "@/lib/vyron-cost/customer-invoice-flow";
import { VyronPremiumEmptyState, VyronPremiumSectionHeading } from "@/components/vyron-premium/VyronPremiumSprint";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

type CustomerOption = { id: string; name: string; email?: string };
type StatementInvoice = {
  invoice_number: string;
  invoice_date: string;
  status: string;
  sales_value: number;
};

export default function CustomerStatementsClient() {
  const [customers, setCustomers] = useState<CustomerOption[]>([
    { id: "cust-001", name: "Local Café Group", email: "accounts@localcafegroup.co.za" },
    { id: "cust-002", name: "Farmstall Foods", email: "orders@farmstallfoods.co.za" },
  ]);
  const [customerId, setCustomerId] = useState("cust-001");
  const [fromDate, setFromDate] = useState("2026-01-01");
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoices, setInvoices] = useState<StatementInvoice[]>([]);
  const [outstanding, setOutstanding] = useState(0);
  const [totalSales, setTotalSales] = useState(0);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? customers[0];

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.customers) && d.customers.length) {
          setCustomers(
            d.customers.map((c: { id: string; customer_name: string; email?: string }) => ({
              id: c.id,
              name: c.customer_name,
              email: c.email || undefined,
            }))
          );
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ customerName: selectedCustomer?.name || "", fromDate, toDate });
    fetch(`/api/customer-statements?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setInvoices(d.invoices || []);
          setOutstanding(Number(d.outstanding || 0));
          setTotalSales(Number(d.totalSales || 0));
        }
      })
      .catch(() => undefined);
  }, [selectedCustomer?.name, fromDate, toDate]);

  const emailHref = useMemo(() => {
    const body = [
      `Customer: ${selectedCustomer?.name}`,
      `Period: ${fromDate} to ${toDate}`,
      `Outstanding: ${formatCurrency(outstanding)}`,
      `Total sales: ${formatCurrency(totalSales)}`,
      "",
      ...invoices.map((inv) => `${inv.invoice_number} · ${inv.invoice_date} · ${inv.status} · ${formatCurrency(inv.sales_value)}`),
    ].join("\n");
    return buildMailtoLink({
      to: [selectedCustomer?.email || ""],
      subject: `Customer Statement - ${selectedCustomer?.name}`,
      body,
    });
  }, [selectedCustomer, fromDate, toDate, outstanding, totalSales, invoices]);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "customers",
        badge: "Premium Sales Workspace",
        title: "Customer Statements Centre",
        subtitle: "Outstanding balance and invoice history by customer and date range — print or email board-ready statements.",
        outcomes: [
          "Filter statements by customer and period",
          "See outstanding balance at a glance",
          "Print or email statements to debtors",
          "Review invoice history for the period",
        ],
        formulaTitle: "Debtor formulas",
        formulas: [
          { label: "Outstanding", formula: "Σ unpaid invoice balances" },
          { label: "Period Sales", formula: "Σ invoice values in date range" },
          { label: "Days Outstanding", formula: "Today − invoice due date (unpaid)" },
        ],
        intelligenceTitle: "Recovery Intelligence",
        intelligenceItems: [
          { label: "Outstanding", detail: "Unpaid invoices are cash still owed — chase before terms slip." },
          { label: "Period view", detail: "Date-range filtering supports month-end debtor reconciliation." },
          { label: "Email discipline", detail: "Statements from VYRON COST keep a consistent commercial record." },
        ],
      }}
    >
      <section className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <VyronPremiumSectionHeading eyebrow="Filter" title="Statement parameters" subtitle="Select customer and date range." />

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="text-sm font-black text-slate-600">
            Customer
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400">
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-black text-slate-600">
            From Date
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400" />
          </label>
          <label className="text-sm font-black text-slate-600">
            To Date
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400" />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => window.print()} className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800">Print Statement</button>
          <a href={emailHref} className="rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white">Email Statement</a>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">Outstanding Balance</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{formatCurrency(outstanding)}</p>
        </div>
        <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">Total Sales (Period)</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{formatCurrency(totalSales)}</p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <VyronPremiumSectionHeading eyebrow="History" title="Invoice history" />
        <EnterpriseScrollContainer className="mt-4 rounded-3xl border border-slate-100">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length ? invoices.map((invoice) => (
                <tr key={invoice.invoice_number}>
                  <td className="px-4 py-3 font-black text-violet-700">{invoice.invoice_number}</td>
                  <td className="px-4 py-3">{invoice.invoice_date}</td>
                  <td className="px-4 py-3">{invoice.status}</td>
                  <td className="px-4 py-3 text-right font-black">{formatCurrency(invoice.sales_value)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-4 py-6">
                    <VyronPremiumEmptyState
                      steps={[
                        "Create customers and raise invoices.",
                        "Post invoices for the selected period.",
                        "Return here to print or email statements.",
                        "Chase outstanding balances from one view.",
                      ]}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </EnterpriseScrollContainer>
      </section>
    </VyronPremiumPageShell>
  );
}
