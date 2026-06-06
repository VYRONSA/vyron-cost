"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/vyron-cost/stock-engine";
import {
  buildMailtoLink,
  computeInvoiceTotals,
  postInvoiceLocally,
  type LocalCustomerInvoice,
} from "@/lib/vyron-cost/customer-invoice-flow";

type InvoiceStatus = "Draft" | "Approved" | "Posted" | "Sent" | "Paid" | "Cancelled" | "Reversed";

type Customer = {
  id: string;
  name: string;
  terms: string;
  email: string;
};

type Product = {
  id: string;
  name: string;
  stock: number;
  unitCost: number;
  sellingPrice: number;
};

type InvoiceLine = {
  id: string;
  productId: string;
  qty: number;
  sellingPrice: number;
};

type CustomerInvoice = LocalCustomerInvoice & {
  stockPosted?: boolean;
  postedAt?: string;
};

const STORAGE_KEY = "vyron-cost-customer-invoices-clean-v1";

const demoCustomers: Customer[] = [
  { id: "cust-001", name: "Local Café Group", terms: "7 Days", email: "accounts@localcafegroup.co.za" },
  { id: "cust-002", name: "Farmstall Foods", terms: "14 Days", email: "orders@farmstallfoods.co.za" },
  { id: "cust-003", name: "Corporate Canteen Supplies", terms: "30 Days", email: "finance@corporatecanteens.co.za" },
  { id: "cust-004", name: "School Tuckshop Network", terms: "COD", email: "admin@schooltuckshops.co.za" },
];

const demoProducts: Product[] = [
  { id: "fg-beef", name: "Beef Pie", stock: 1200, unitCost: 14.2, sellingPrice: 24.5 },
  { id: "fg-chicken", name: "Chicken Pie", stock: 880, unitCost: 13.1, sellingPrice: 22.5 },
  { id: "fg-mutton", name: "Mutton Pie", stock: 590, unitCost: 16.85, sellingPrice: 29.5 },
  { id: "fg-cheese", name: "Cheese Pie", stock: 760, unitCost: 11.9, sellingPrice: 21.5 },
  { id: "fg-pepper", name: "Pepper Steak Pie", stock: 410, unitCost: 15.4, sellingPrice: 27.5 },
];

const defaultInvoices: CustomerInvoice[] = [
  {
    id: "inv-001",
    invoiceNumber: "SI-0001",
    customerId: "cust-001",
    invoiceDate: "2026-06-05",
    status: "Sent",
    stockPosted: true,
    postedAt: "2026-06-05T08:00:00.000Z",
    lines: [
      { id: "line-001", productId: "fg-beef", qty: 100, sellingPrice: 24.5 },
      { id: "line-002", productId: "fg-chicken", qty: 80, sellingPrice: 22.5 },
    ],
    note: "Demo invoice already sent. Finished goods stock reduced.",
    additionalEmails: "manager@localcafegroup.co.za",
    emailedAt: "2026-06-05T09:30:00.000Z",
  },
];

function newLine(): InvoiceLine {
  return { id: crypto.randomUUID(), productId: "fg-beef", qty: 50, sellingPrice: 24.5 };
}

export default function CustomerInvoicesClient() {
  const [invoices, setInvoices] = useState<CustomerInvoice[]>(defaultInvoices);
  const [formOpen, setFormOpen] = useState(true);
  const [customerId, setCustomerId] = useState("cust-001");
  const [lines, setLines] = useState<InvoiceLine[]>([newLine()]);
  const [note, setNote] = useState("Customer invoice for finished goods sale");
  const [emailInvoiceId, setEmailInvoiceId] = useState<string | null>(null);
  const [additionalEmails, setAdditionalEmails] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [productStock, setProductStock] = useState<Record<string, number>>(
    Object.fromEntries(demoProducts.map((product) => [product.id, product.stock]))
  );
  const [postingId, setPostingId] = useState<string | null>(null);

  const [emailMessage, setEmailMessage] = useState("Good day,\n\nPlease find your customer invoice details below.\n\nKind regards,\nVYRON COST");

  const refreshFromApi = useCallback(async () => {
    const res = await fetch("/api/customer-invoices");
    const data = await res.json();
    if (data.ok && Array.isArray(data.invoices) && data.invoices.length) {
      // Server invoices available — keep local demo as fallback for now.
    }
  }, []);

  useEffect(() => {
    void refreshFromApi();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as CustomerInvoice[];
        if (Array.isArray(parsed)) setInvoices(parsed);
      } catch {
        setInvoices(defaultInvoices);
      }
    }
  }, [refreshFromApi]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
  }, [invoices]);

  const usedStock = useMemo(() => {
    const result: Record<string, number> = {};
    for (const invoice of invoices) {
      if (!invoice.stockPosted) continue;
      for (const line of invoice.lines) result[line.productId] = (result[line.productId] || 0) + line.qty;
    }
    return result;
  }, [invoices]);

  const productsWithBalance = demoProducts.map((product) => ({
    ...product,
    sold: usedStock[product.id] || 0,
    balance: (productStock[product.id] ?? product.stock) - (usedStock[product.id] || 0),
  }));

  const summary = useMemo(() => {
    let revenue = 0;
    let cogs = 0;
    for (const invoice of invoices) {
      if (["Cancelled", "Reversed"].includes(invoice.status)) continue;
      for (const line of invoice.lines) {
        const product = demoProducts.find((item) => item.id === line.productId);
        revenue += line.qty * line.sellingPrice;
        cogs += line.qty * (product?.unitCost || 0);
      }
    }
    const gp = revenue - cogs;
    const gpPct = revenue ? (gp / revenue) * 100 : 0;
    return { revenue, cogs, gp, gpPct };
  }, [invoices]);

  const emailInvoice = emailInvoiceId ? invoices.find((invoice) => invoice.id === emailInvoiceId) : null;
  const emailCustomer = emailInvoice ? customerFor(emailInvoice.customerId) : null;

  function customerFor(id: string) {
    return demoCustomers.find((customer) => customer.id === id) ?? demoCustomers[0];
  }

  function productFor(id: string) {
    return demoProducts.find((product) => product.id === id) ?? demoProducts[0];
  }

  function totals(invoice: CustomerInvoice) {
    let sales = 0;
    let cogs = 0;
    for (const line of invoice.lines) {
      const product = productFor(line.productId);
      sales += line.qty * line.sellingPrice;
      cogs += line.qty * product.unitCost;
    }
    return { sales, cogs, gp: sales - cogs };
  }

  function updateLine(id: string, patch: Partial<InvoiceLine>) {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        if (patch.productId && patch.sellingPrice === undefined) next.sellingPrice = productFor(patch.productId).sellingPrice;
        return next;
      })
    );
  }

  function addLine() {
    setLines((current) => [...current, newLine()]);
  }

  function removeLine(id: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.id !== id)));
  }

  function saveInvoice() {
    const validLines = lines.filter((line) => line.qty > 0);
    if (!validLines.length) {
      alert("Add at least one invoice line.");
      return;
    }

    const invoice: CustomerInvoice = {
      id: crypto.randomUUID(),
      invoiceNumber: `SI-${String(invoices.length + 1).padStart(4, "0")}`,
      customerId,
      invoiceDate: new Date().toISOString().slice(0, 10),
      status: "Draft",
      lines: validLines,
      note,
      additionalEmails: "",
    };

    setInvoices((current) => [invoice, ...current]);
    setLines([newLine()]);
    setNote("Customer invoice for finished goods sale");
    setFormOpen(false);
  }

  function setStatus(id: string, status: InvoiceStatus) {
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === id
          ? {
              ...invoice,
              status,
              note:
                status === "Approved"
                  ? "Approved for posting. Stock is not reduced until Post Invoice."
                  : status === "Sent"
                    ? "Sent to customer."
                    : status === "Reversed"
                      ? "Reversed by supervisor. Stock impact should be corrected in stock ledger."
                      : invoice.note,
            }
          : invoice
      )
    );
  }

  async function postInvoice(id: string) {
    setPostingId(id);
    try {
      try {
        const res = await fetch(`/api/customer-invoices/${id}/post`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actor: "user" }),
        });
        const data = await res.json();
        if (data.ok && data.invoice) {
          setInvoices((current) =>
            current.map((invoice) =>
              invoice.id === id
                ? {
                    ...invoice,
                    status: "Posted",
                    stockPosted: true,
                    postedAt: data.invoice.posted_at || new Date().toISOString(),
                    note: "Posted. Stock reduced, ledger updated, customer history updated, Xero queue created.",
                  }
                : invoice
            )
          );
          if (data.warnings?.length) alert(data.warnings.join("\n"));
          return;
        }
      } catch {
        // fall through to local posting
      }

      const invoice = invoices.find((item) => item.id === id);
      if (!invoice) return;
      const result = postInvoiceLocally(
        invoice,
        (productId) => productFor(productId).name,
        (productId) => productFor(productId).unitCost,
        productStock
      );
      setProductStock(result.stock);
      setInvoices((current) => current.map((item) => (item.id === id ? result.invoice : item)));
      if (result.warnings.length) alert(result.warnings.join("\n"));
    } finally {
      setPostingId(null);
    }
  }

  function openEmailPanel(invoice: CustomerInvoice) {
    const customer = customerFor(invoice.customerId);
    setEmailInvoiceId(invoice.id);
    setAdditionalEmails(invoice.additionalEmails || "");
    setEmailSubject(`Customer Invoice ${invoice.invoiceNumber} - ${customer.name}`);
    setEmailCc("");
    setEmailBcc("");
  }

  function buildEmailHref(invoice: CustomerInvoice) {
    const customer = customerFor(invoice.customerId);
    const invoiceTotals = computeInvoiceTotals(invoice, (productId) => productFor(productId).unitCost);
    const recipients = [customer.email, additionalEmails]
      .join(",")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

    const lineText = invoice.lines
      .map((line) => {
        const product = productFor(line.productId);
        return `${product.name} | Qty: ${formatNumber(line.qty)} | Price: ${formatCurrency(line.sellingPrice)} | Total: ${formatCurrency(line.qty * line.sellingPrice)}`;
      })
      .join("\n");

    const body = `${emailMessage}

Invoice: ${invoice.invoiceNumber}
Customer: ${customer.name}
Date: ${invoice.invoiceDate}
Terms: ${customer.terms}

${lineText}

Invoice Total: ${formatCurrency(invoiceTotals.sales)}

This invoice was generated from VYRON COST.`;

    return buildMailtoLink({
      to: recipients,
      cc: emailCc.split(",").map((v) => v.trim()).filter(Boolean),
      bcc: emailBcc.split(",").map((v) => v.trim()).filter(Boolean),
      subject: emailSubject || `Customer Invoice ${invoice.invoiceNumber} - ${customer.name}`,
      body,
    });
  }

  function markEmailed(invoiceId: string) {
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === invoiceId
          ? {
              ...invoice,
              status: invoice.status === "Draft" ? "Sent" : invoice.status,
              additionalEmails,
              emailedAt: new Date().toISOString(),
              note: "Invoice email prepared/sent to customer.",
            }
          : invoice
      )
    );
    setEmailInvoiceId(null);
  }

  function resetDemo() {
    setInvoices(defaultInvoices);
    setLines([newLine()]);
    setCustomerId("cust-001");
    setEmailInvoiceId(null);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultInvoices));
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Sales Value" value={formatCurrency(summary.revenue)} />
        <Metric title="COGS" value={formatCurrency(summary.cogs)} />
        <Metric title="Gross Profit" value={formatCurrency(summary.gp)} />
        <Metric title="GP %" value={`${summary.gpPct.toFixed(1)}%`} />
      </div>

      <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.10)]">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <h2 className="text-xl font-black text-slate-950">Customer Invoice Control</h2>
            <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-600">
              Create invoices separately from the customer master file. Email is opened only from the invoice actions.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button onClick={() => setFormOpen((value) => !value)} className="rounded-full bg-purple-700 px-5 py-2.5 text-sm font-black text-white">
              {formOpen ? "Close Invoice Form" : "New Customer Invoice"}
            </button>
            <button onClick={resetDemo} className="rounded-full border border-purple-200 bg-white px-5 py-2.5 text-sm font-black text-purple-800">Reset Demo</button>
            <button onClick={() => window.print()} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-800">Print</button>
          </div>
        </div>

        {formOpen ? (
          <div className="mt-5 rounded-[28px] border border-purple-100 bg-purple-50/70 p-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2 text-sm font-black text-slate-700">
                Customer
                <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-bold outline-none">
                  {demoCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </label>

              <label className="space-y-2 text-sm font-black text-slate-700">
                Invoice Note
                <input value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-bold outline-none" />
              </label>
            </div>

            <div className="mt-4 space-y-3">
              {lines.map((line, index) => {
                const product = productFor(line.productId);
                const sales = line.qty * line.sellingPrice;
                const gp = sales - line.qty * product.unitCost;

                return (
                  <div key={line.id} className="rounded-3xl border border-white bg-white/85 p-4">
                    <div className="grid gap-3 xl:grid-cols-[90px_1.4fr_1fr_1fr_1fr_1fr_170px] xl:items-end">
                      <div className="rounded-2xl bg-purple-100 px-3 py-3 text-center text-sm font-black text-purple-800">Line {index + 1}</div>

                      <label className="space-y-2 text-sm font-black text-slate-700">
                        Product
                        <select value={line.productId} onChange={(event) => updateLine(line.id, { productId: event.target.value })} className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-bold outline-none">
                          {demoProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </label>

                      <NumberField label="Qty Sold" value={line.qty} onChange={(value) => updateLine(line.id, { qty: value })} />
                      <NumberField label="Selling Price" value={line.sellingPrice} onChange={(value) => updateLine(line.id, { sellingPrice: value })} />
                      <ReadOnlyField label="Line Sales" value={formatCurrency(sales)} />
                      <ReadOnlyField label="GP" value={formatCurrency(gp)} />

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <button type="button" onClick={addLine} className="rounded-full bg-purple-100 px-3 py-2 text-xs font-black text-purple-800">Add</button>
                        <button type="button" onClick={() => removeLine(line.id)} className="rounded-full bg-rose-100 px-3 py-2 text-xs font-black text-rose-800">Remove</button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button onClick={saveInvoice} className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white">Save Draft</button>
            </div>
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-[110px_1.5fr_120px_120px_120px_120px_120px_260px] gap-3 rounded-3xl bg-slate-950 px-4 py-3 text-xs font-black text-white">
            <div>Invoice</div>
            <div>Customer</div>
            <div>Date</div>
            <div className="text-right">Sales</div>
            <div className="text-right">COGS</div>
            <div className="text-right">GP</div>
            <div>Status</div>
            <div>Actions</div>
          </div>

          {invoices.map((invoice) => {
            const customer = customerFor(invoice.customerId);
            const invoiceTotals = totals(invoice);

            return (
              <div key={invoice.id} className="grid grid-cols-[110px_1.5fr_120px_120px_120px_120px_120px_260px] items-center gap-3 rounded-3xl border border-slate-100 bg-white px-4 py-4 text-sm shadow-sm">
                <div className="font-black text-purple-700">{invoice.invoiceNumber}</div>
                <div className="font-black text-slate-950">{customer.name}</div>
                <div className="font-semibold text-slate-600">{invoice.invoiceDate}</div>
                <div className="text-right font-black">{formatCurrency(invoiceTotals.sales)}</div>
                <div className="text-right font-bold">{formatCurrency(invoiceTotals.cogs)}</div>
                <div className="text-right font-black text-emerald-700">{formatCurrency(invoiceTotals.gp)}</div>
                <div><StatusBadge status={invoice.status} /></div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton tone="slate" onClick={() => window.print()}>Print</ActionButton>
                  <ActionButton tone="purple" onClick={() => openEmailPanel(invoice)}>Email</ActionButton>
                  {invoice.status === "Draft" ? (
                    <>
                      <ActionButton tone="slate" onClick={() => setStatus(invoice.id, "Draft")}>Save Draft</ActionButton>
                      <ActionButton tone="indigo" onClick={() => setStatus(invoice.id, "Approved")}>Approve</ActionButton>
                      <ActionButton tone="emerald" onClick={() => void postInvoice(invoice.id)}>
                        {postingId === invoice.id ? "Posting…" : "Post Invoice"}
                      </ActionButton>
                    </>
                  ) : null}
                  {invoice.status === "Approved" && !invoice.stockPosted ? (
                    <ActionButton tone="emerald" onClick={() => void postInvoice(invoice.id)}>
                      {postingId === invoice.id ? "Posting…" : "Post Invoice"}
                    </ActionButton>
                  ) : null}
                  {invoice.status === "Posted" ? <ActionButton tone="indigo" onClick={() => setStatus(invoice.id, "Sent")}>Send</ActionButton> : null}
                  {invoice.status === "Sent" ? <ActionButton tone="emerald" onClick={() => setStatus(invoice.id, "Paid")}>Paid</ActionButton> : null}
                  {!["Cancelled", "Reversed", "Paid"].includes(invoice.status) ? (
                    <ActionButton tone="slate" onClick={() => setStatus(invoice.id, "Cancelled")}>Cancel</ActionButton>
                  ) : null}
                  {invoice.stockPosted ? <ActionButton tone="rose" onClick={() => setStatus(invoice.id, "Reversed")}>Reverse</ActionButton> : null}
                </div>

                <div className="col-span-8 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-600">
                  <span className="font-black text-slate-900">Stock impact: </span>{stockImpactText(invoice)}
                  <span className="ml-3 font-black text-slate-900">Note: </span>{invoice.note || "—"}
                  {invoice.emailedAt ? <span className="ml-3 font-black text-emerald-700">Emailed: {new Date(invoice.emailedAt).toLocaleString()}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {emailInvoice && emailCustomer ? (
        <div className="rounded-[32px] border border-purple-100 bg-purple-50/80 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.10)]">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <h2 className="text-xl font-black text-slate-950">Email Customer Invoice</h2>
              <p className="mt-1 text-sm font-medium text-slate-600">
                The customer email from the customer file is loaded here. Add extra recipients only when emailing.
              </p>
            </div>
            <button onClick={() => setEmailInvoiceId(null)} className="rounded-full border border-purple-200 bg-white px-5 py-2.5 text-sm font-black text-purple-800">Close Email</button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <ReadOnlyField label="Customer Email From File" value={emailCustomer.email} />
            <label className="space-y-2 text-sm font-black text-slate-700">
              Add Extra Emails
              <input value={additionalEmails} onChange={(event) => setAdditionalEmails(event.target.value)} placeholder="extra@email.co.za, manager@email.co.za" className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-bold outline-none" />
            </label>
            <label className="space-y-2 text-sm font-black text-slate-700">
              CC
              <input value={emailCc} onChange={(event) => setEmailCc(event.target.value)} placeholder="cc@email.co.za" className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-bold outline-none" />
            </label>
            <label className="space-y-2 text-sm font-black text-slate-700">
              BCC
              <input value={emailBcc} onChange={(event) => setEmailBcc(event.target.value)} placeholder="bcc@email.co.za" className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-bold outline-none" />
            </label>
            <label className="space-y-2 text-sm font-black text-slate-700 lg:col-span-2">
              Subject
              <input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-bold outline-none" />
            </label>

            <label className="space-y-2 text-sm font-black text-slate-700 lg:col-span-2">
              Email Message
              <textarea value={emailMessage} onChange={(event) => setEmailMessage(event.target.value)} rows={5} className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-bold outline-none" />
            </label>
          </div>

          <a
            href={buildEmailHref(emailInvoice)}
            onClick={() => markEmailed(emailInvoice.id)}
            className="mt-5 inline-flex rounded-full bg-purple-700 px-6 py-3 text-sm font-black text-white"
          >
            Open Email to Customer
          </a>
        </div>
      ) : null}

      <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.10)]">
        <h2 className="text-xl font-black text-slate-950">Finished Goods Balance After Customer Invoices</h2>
        <p className="mt-1 text-sm font-medium text-slate-600">Approved, sent and paid customer invoices reduce available finished goods stock.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {productsWithBalance.map((product) => (
            <div key={product.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-black text-slate-950">{product.name}</p>
              <div className="mt-3 space-y-2 text-xs font-bold text-slate-600">
                <div className="flex justify-between"><span>Opening</span><span>{formatNumber(product.stock)}</span></div>
                <div className="flex justify-between"><span>Sold</span><span className="text-rose-700">{formatNumber(product.sold)}</span></div>
                <div className="flex justify-between border-t border-slate-100 pt-2"><span>Balance</span><span className="font-black text-purple-700">{formatNumber(product.balance)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  function stockImpactText(invoice: CustomerInvoice) {
    if (!invoice.stockPosted) return "No stock impact yet. Stock reduces when Post Invoice is executed.";
    return invoice.lines.map((line) => `${productFor(line.productId).name} -${formatNumber(line.qty)}`).join(" | ");
  }
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_16px_50px_rgba(76,29,149,0.10)]">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-700">{title}</p>
      <p className="mt-3 truncate text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-2 text-sm font-black text-slate-700">
      {label}
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-bold outline-none" />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2 text-sm font-black text-slate-700">
      {label}
      <div className="min-h-[46px] rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-black text-slate-950">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const classes: Record<InvoiceStatus, string> = {
    Draft: "bg-amber-100 text-amber-800",
    Approved: "bg-indigo-100 text-indigo-800",
    Posted: "bg-cyan-100 text-cyan-800",
    Sent: "bg-purple-100 text-purple-800",
    Paid: "bg-emerald-100 text-emerald-800",
    Cancelled: "bg-slate-200 text-slate-700",
    Reversed: "bg-rose-100 text-rose-800",
  };
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${classes[status]}`}>{status}</span>;
}

function ActionButton({
  children,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  tone: "indigo" | "emerald" | "purple" | "rose" | "slate";
  onClick: () => void;
}) {
  const tones = {
    indigo: "bg-indigo-100 text-indigo-800",
    emerald: "bg-emerald-100 text-emerald-800",
    purple: "bg-purple-100 text-purple-800",
    rose: "bg-rose-100 text-rose-800",
    slate: "bg-slate-100 text-slate-700",
  };
  return <button type="button" onClick={onClick} className={`rounded-full px-3 py-1.5 text-xs font-black ${tones[tone]}`}>{children}</button>;
}
