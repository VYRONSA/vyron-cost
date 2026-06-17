"use client";

import { BrainCircuit, CheckCircle2, FileText, Search, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import StatusPill from "@/components/StatusPill";
import { formatMoney } from "@/lib/vyron-cost-data";
import { VyronInvoiceHeader, VyronInvoiceLine } from "@/lib/vyron-enterprise-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function invoiceTone(status: string | null): "red" | "amber" | "emerald" | "slate" {
  const value = String(status || "").toLowerCase();
  if (value.includes("review")) return "amber";
  if (value.includes("approved") || value.includes("complete")) return "emerald";
  if (value.includes("reject") || value.includes("blocked")) return "red";
  return "slate";
}

export default function InvoiceAiCentreClient({
  invoices,
  lines,
}: {
  invoices: VyronInvoiceHeader[];
  lines: VyronInvoiceLine[];
}) {
  const [search, setSearch] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");

  const filteredInvoices = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return invoices;

    return invoices.filter((invoice) =>
      [
        invoice.supplier_name || "",
        invoice.invoice_number || "",
        invoice.invoice_status || "",
        String(invoice.invoice_total || ""),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [invoices, search]);

  return (
    <VyronPremiumPageShell
      config={{
        title: "Invoice Ai Centre",
        subtitle: "Premium VYRON COST workflow for invoice ai centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
                <div className="rounded-2xl bg-[#A3E635]/12 p-3 text-[#A3E635] w-fit">
                  <BrainCircuit size={26} />
                </div>

                <h2 className="mt-5 text-2xl font-black">AI Invoice Pipeline</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  This is the foundation for supplier invoice email ingestion, line extraction, price matching and GP impact detection.
                </p>
              </div>

              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 p-3 text-[#65A30D] w-fit">
                  <UploadCloud size={26} />
                </div>
                <h2 className="mt-5 text-2xl font-black text-[#F8FAFC]">Upload / Email Ready</h2>
                <p className="mt-3 text-sm leading-7 text-slate-500">
                  Upload supplier PDFs into the review queue. Email inbox automation comes next.
                </p>
                <label className="mt-4 block cursor-pointer rounded-2xl border border-[#A3E635]/25 bg-[#A3E635]/10 px-4 py-3 text-sm font-black text-[#4D7C0F]">
                  Upload invoice PDF
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(event) => setUploadedFileName(event.target.files?.[0]?.name || '')}
                  />
                </label>
                {uploadedFileName ? <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#65A30D]">Staged: {uploadedFileName}</div> : null}
              </div>

              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 p-3 text-[#65A30D] w-fit">
                  <CheckCircle2 size={26} />
                </div>
                <h2 className="mt-5 text-2xl font-black text-[#F8FAFC]">Approval Ready</h2>
                <p className="mt-3 text-sm leading-7 text-slate-500">
                  Invoice price changes should go to procurement/finance approval before updating live costs.
                </p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3 rounded-[1.5rem] border border-[#A3E635]/20 bg-[#A3E635]/10 px-4 py-3">
                <Search size={20} className="text-[#65A30D]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search invoices by supplier, number, status or amount..."
                  className="w-full bg-transparent text-sm font-black text-slate-700 outline-none placeholder:text-slate-400"
                />
                <div className="rounded-full bg-[#07110d] px-4 py-2 text-xs font-black text-[#A3E635]">
                  {filteredInvoices.length} invoices
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <h2 className="text-2xl font-black text-[#F8FAFC]">Invoice Queue</h2>

              <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-100">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
                    <div>Supplier</div>
                    <div>Invoice</div>
                    <div>Date</div>
                    <div>Total</div>
                    <div>VAT</div>
                    <div>AI</div>
                    <div>Status</div>
                  </div>

                  {filteredInvoices.map((invoice) => (
                    <div key={invoice.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-5 text-sm">
                      <div className="font-black text-[#F8FAFC]">{invoice.supplier_name || "Unknown"}</div>
                      <div>{invoice.invoice_number || "No number"}</div>
                      <div>{invoice.invoice_date || "No date"}</div>
                      <div className="font-black">{formatMoney(Number(invoice.invoice_total || 0))}</div>
                      <div>{formatMoney(Number(invoice.vat_total || 0))}</div>
                      <div>
                        <StatusPill tone={invoice.ai_processed ? "emerald" : "amber"}>
                          {invoice.ai_processed ? "Processed" : "Pending"}
                        </StatusPill>
                      </div>
                      <div>
                        <StatusPill tone={invoiceTone(invoice.invoice_status)}>
                          {invoice.invoice_status || "Pending"}
                        </StatusPill>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 p-3 text-[#65A30D]">
                  <FileText size={22} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-[#F8FAFC]">Extracted Invoice Lines</h2>
                  <p className="text-sm text-slate-500">AI matching preview for supplier line items.</p>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-100">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
                    <div>Supplier Item</div>
                    <div>Mapped Ingredient</div>
                    <div>Qty</div>
                    <div>Unit</div>
                    <div>Unit Price</div>
                    <div>Line Total</div>
                    <div>Confidence</div>
                  </div>

                  {lines.map((line) => (
                    <div key={line.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-5 text-sm">
                      <div className="font-black text-[#F8FAFC]">{line.supplier_product_name || "Unknown"}</div>
                      <div>{line.ingredient_name || "Unmapped"}</div>
                      <div>{Number(line.quantity || 0).toFixed(3)}</div>
                      <div>{line.unit || "unit"}</div>
                      <div>{formatMoney(Number(line.unit_price || 0))}</div>
                      <div className="font-black">{formatMoney(Number(line.line_total || 0))}</div>
                      <div>
                        <StatusPill tone={Number(line.ai_confidence || 0) >= 90 ? "emerald" : "amber"}>
                          {Number(line.ai_confidence || 0).toFixed(0)}%
                        </StatusPill>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
