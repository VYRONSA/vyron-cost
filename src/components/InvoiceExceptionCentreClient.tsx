"use client";

import { InvoiceRiskFinding } from "@/lib/vyron-leakage-intelligence-data";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoiceExceptionCentreClient({ invoices }: { invoices: InvoiceRiskFinding[] }) {
  const exposure = invoices.reduce((sum, invoice) => sum + Number(invoice.invoice_amount || 0), 0);

  return (
    <section className="grid gap-6">
      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-[2rem] bg-white p-6">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Exception Exposure</div>
          <div className="mt-3 text-4xl font-black text-red-700">{money(exposure)}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Exceptions</div>
          <div className="mt-3 text-4xl font-black">{invoices.length}</div>
        </div>
        <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Control</div>
          <div className="mt-3 text-3xl font-black">Review before payment</div>
        </div>
      </section>

      <div className="overflow-hidden rounded-[2rem] bg-white">
        <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase text-emerald-300">
          <div>Invoice</div>
          <div>Supplier</div>
          <div>Amount</div>
          <div>Risk</div>
          <div>Score</div>
          <div>Confidence</div>
          <div>Status</div>
        </div>
        {invoices.map((invoice) => (
          <div key={invoice.id} className="grid grid-cols-7 border-t border-slate-100 px-5 py-5 text-sm">
            <div className="font-black">{invoice.invoice_number}</div>
            <div>{invoice.supplier_name}</div>
            <div>{money(invoice.invoice_amount)}</div>
            <div>{invoice.risk_type}</div>
            <div className="font-black text-red-700">{Number(invoice.risk_score || 0).toFixed(0)}</div>
            <div>{Number(invoice.ai_confidence || 0).toFixed(0)}%</div>
            <div>{invoice.review_status}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
