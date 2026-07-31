"use client";

import { CheckCircle2, FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import StatusPill from "@/components/StatusPill";
import { VyronInvoiceHeader, VyronInvoiceLine } from "@/lib/vyron-enterprise-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoiceProcessingQueueClient({
  invoices,
  lines,
}: {
  invoices: VyronInvoiceHeader[];
  lines: VyronInvoiceLine[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return invoices;
    return invoices.filter((invoice) =>
      [invoice.supplier_name || "", invoice.invoice_number || "", invoice.invoice_status || ""]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [invoices, search]);

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
        <FileText size={32} className="text-[#A855F7]" />
        <h2 className="mt-5 text-3xl font-black">Invoice Processing Queue</h2>
        <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
          Review extracted invoice data, confidence scores and supplier price movements before updating live ingredient costs.
        </p>
      </div>

      <div className="rounded-[2rem] bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-3 rounded-[1.5rem] border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3">
          <Search size={20} className="text-[#7E22CE]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search invoice queue..."
            className="w-full bg-transparent text-sm font-black text-slate-700 outline-none placeholder:text-slate-400"
          />
          <div className="rounded-full bg-[#07110d] px-4 py-2 text-xs font-black text-[#A855F7]">{filtered.length} invoices</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="min-w-[1050px]">
          <div className="grid grid-cols-8 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
            <div>Supplier</div>
            <div>Invoice</div>
            <div>Date</div>
            <div>Total</div>
            <div>VAT</div>
            <div>Lines</div>
            <div>AI</div>
            <div>Status</div>
          </div>
          {filtered.map((invoice) => {
            const invoiceLines = lines.filter((line) => line.invoice_id === invoice.id);
            const avgConfidence = invoiceLines.length
              ? invoiceLines.reduce((sum, line) => sum + Number(line.ai_confidence || 0), 0) / invoiceLines.length
              : 0;

            return (
    <VyronPremiumPageShell
      config={{
        title: "Invoice Processing Queue",
        subtitle: "Premium VYRON COST workflow for invoice processing queue.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div key={invoice.id} className="grid grid-cols-8 items-center border-t border-slate-100 px-5 py-5 text-sm">
                      <div className="font-black text-[#F8FAFC]">{invoice.supplier_name}</div>
                      <div>{invoice.invoice_number}</div>
                      <div>{invoice.invoice_date}</div>
                      <div className="font-black">{money(invoice.invoice_total)}</div>
                      <div>{money(invoice.vat_total)}</div>
                      <div>{invoiceLines.length}</div>
                      <div><StatusPill tone={avgConfidence >= 90 ? "emerald" : "amber"}>{avgConfidence.toFixed(0)}%</StatusPill></div>
                      <div><StatusPill tone={invoice.ai_processed ? "emerald" : "amber"}>{invoice.invoice_status || "Pending"}</StatusPill></div>
                    </div>
    </VyronPremiumPageShell>
  );
          })}
        </div>
      </div>

      <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-2xl font-black text-[#F8FAFC]">Processing Rules</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {["Match supplier", "Match ingredient", "Detect price movement", "Flag duplicate", "Hold for approval", "Update live cost after approval"].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
              <CheckCircle2 className="text-[#7E22CE]" size={18} />
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
