"use client";

import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";
import StatusPill from "@/components/StatusPill";
import { formatMoney, InvoiceExtractedLine, InvoiceQueueItem, statusTone } from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";

export default function InvoiceAiManager({
  initialInvoices,
  initialLines,
}: {
  initialInvoices: InvoiceQueueItem[];
  initialLines: InvoiceExtractedLine[];
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [lines, setLines] = useState(initialLines);
  const [message, setMessage] = useState("");

  async function updateInvoiceStatus(id: string, status: string) {
    setInvoices((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));

    if (supabase && !id.startsWith("inv")) {
      await supabase.from("vyron_cost_invoice_queue").update({ status }).eq("id", id);
    }

    setMessage(`Invoice marked as ${status}.`);
  }

  async function updateLineStatus(id: string, status: string) {
    setLines((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));

    if (supabase && !id.startsWith("line")) {
      await supabase.from("vyron_cost_invoice_extracted_lines").update({ status }).eq("id", id);
    }

    setMessage(`Line marked as ${status}.`);
  }

  return (
    <section className="grid gap-6">
      {message && (
        <div className="rounded-3xl bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">
          {message}
        </div>
      )}

      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-2xl font-black text-[#07110d]">Invoice Queue</h2>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-100">
          <div className="min-w-[1050px]">
            <div className="grid grid-cols-7 bg-[#0b1210] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
              <div>Invoice</div>
              <div>Supplier</div>
              <div>Lines</div>
              <div>Confidence</div>
              <div>Impact</div>
              <div>Status</div>
              <div>Actions</div>
            </div>

            {invoices.map((invoice) => (
              <div key={invoice.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-5 text-sm">
                <div className="font-black text-[#07110d]">{invoice.invoice_number || "No number"}</div>
                <div className="font-bold text-slate-600">{invoice.supplier_name_snapshot || "Supplier pending"}</div>
                <div>{invoice.extracted_lines}</div>
                <div className="font-black">{Number(invoice.confidence).toFixed(1)}%</div>
                <div className="font-black text-emerald-700">{formatMoney(Number(invoice.estimated_impact))}</div>
                <div><StatusPill tone={statusTone(invoice.status)}>{invoice.status}</StatusPill></div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => updateInvoiceStatus(invoice.id, "Approved")} className="rounded-full bg-emerald-50 p-2 text-emerald-700">
                    <CheckCircle2 size={16} />
                  </button>
                  <button type="button" onClick={() => updateInvoiceStatus(invoice.id, "Review")} className="rounded-full bg-amber-50 p-2 text-amber-700">
                    <RefreshCw size={16} />
                  </button>
                  <button type="button" onClick={() => updateInvoiceStatus(invoice.id, "Rejected")} className="rounded-full bg-red-50 p-2 text-red-700">
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-2xl font-black text-[#07110d]">AI Extracted Lines</h2>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-100">
          <div className="min-w-[1180px]">
            <div className="grid grid-cols-8 bg-[#0b1210] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
              <div>Raw Text</div>
              <div>Suggested Match</div>
              <div>Qty</div>
              <div>Unit</div>
              <div>Line Total</div>
              <div>Unit Price</div>
              <div>Status</div>
              <div>Actions</div>
            </div>

            {lines.map((line) => (
              <div key={line.id} className="grid grid-cols-8 items-center border-t border-slate-100 px-5 py-5 text-sm">
                <div className="font-black text-[#07110d]">{line.raw_description}</div>
                <div className="font-bold text-slate-600">{line.suggested_match || "No match"}</div>
                <div>{Number(line.quantity).toFixed(2)}</div>
                <div>{line.unit}</div>
                <div>{formatMoney(Number(line.line_total))}</div>
                <div className="font-black text-emerald-700">{formatMoney(Number(line.extracted_unit_price))}</div>
                <div><StatusPill tone={statusTone(line.status)}>{line.status}</StatusPill></div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => updateLineStatus(line.id, "Approved")} className="rounded-full bg-emerald-50 p-2 text-emerald-700">
                    <CheckCircle2 size={16} />
                  </button>
                  <button type="button" onClick={() => updateLineStatus(line.id, "Review")} className="rounded-full bg-amber-50 p-2 text-amber-700">
                    <RefreshCw size={16} />
                  </button>
                  <button type="button" onClick={() => updateLineStatus(line.id, "Rejected")} className="rounded-full bg-red-50 p-2 text-red-700">
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
