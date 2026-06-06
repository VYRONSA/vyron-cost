"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/vyron-cost/stock-engine";
import { buildMailtoLink } from "@/lib/vyron-cost/customer-invoice-flow";

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
        if (d.ok && d.statement) {
          setInvoices(d.statement.invoices || []);
          setOutstanding(d.statement.outstanding || 0);
          setTotalSales(d.statement.totalSales || 0);
        }
      })
      .catch(() => {
        setInvoices([]);
        setOutstanding(0);
        setTotalSales(0);
      });
  }, [selectedCustomer?.name, fromDate, toDate]);

  const emailHref = useMemo(() => {
    if (!selectedCustomer?.email) return "#";
    const body = `Customer Statement\nCustomer: ${selectedCustomer.name}\nPeriod: ${fromDate} to ${toDate}\nOutstanding: ${formatCurrency(outstanding)}\nTotal Sales: ${formatCurrency(totalSales)}\n\n${invoices
      .map((inv) => `${inv.invoice_number} | ${inv.invoice_date} | ${inv.status} | ${formatCurrency(inv.sales_value)}`)
      .join("\n")}`;
    return buildMailtoLink({
      to: [selectedCustomer.email],
      subject: `Customer Statement - ${selectedCustomer.name}`,
      body,
    });
  }, [selectedCustomer, fromDate, toDate, outstanding, totalSales, invoices]);

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h2 className="text-2xl font-black text-slate-900">Customer Statements</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">Outstanding balance and invoice history by customer and date range.</p>

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
          <a href={emailHref} className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white">Email Statement</a>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">Outstanding Balance</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{formatCurrency(outstanding)}</p>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">Total Sales (Period)</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{formatCurrency(totalSales)}</p>
        </div>
      </section>

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h3 className="text-xl font-black text-slate-900">Invoice History</h3>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-slate-100">
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
                <tr><td colSpan={4} className="px-4 py-8 text-center font-semibold text-slate-500">No invoices found for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
