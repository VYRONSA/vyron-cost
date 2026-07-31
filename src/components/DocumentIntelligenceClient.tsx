"use client";

import { CheckCircle2, FileUp, Mail, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VyronPremiumEmptyState } from "@/components/vyron-premium/VyronPremiumSprint";
import { formatMoney } from "@/lib/vyron-cost-data";

type ExtractedDoc = {
  id: string;
  fileName: string;
  docType: "invoice" | "purchase-order";
  status: string;
  supplier: string;
  documentNumber: string;
  documentDate: string;
  total: number;
  duplicateRisk: boolean;
  lines: { description: string; qty: number; unit: string; unitCost: number; total: number }[];
};

function mockExtract(file: File, docType: "invoice" | "purchase-order"): ExtractedDoc {
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const supplier = /protein|chicken/i.test(baseName)
    ? "Protein Direct"
    : /pack|cape/i.test(baseName)
      ? "Cape Dry Goods"
      : "Fresh Produce Co";
  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    docType,
    status: "Extracted",
    supplier,
    documentNumber: docType === "invoice" ? `INV-${Date.now().toString().slice(-4)}` : `PO-${Date.now().toString().slice(-4)}`,
    documentDate: new Date().toISOString().slice(0, 10),
    total: docType === "invoice" ? 9500 : 8200,
    duplicateRisk: /dup|copy|repeat/i.test(file.name),
    lines: [
      { description: "Chicken Fillet", qty: 120, unit: "kg", unitCost: 95, total: 11400 },
      { description: "Pastry Shell", qty: 200, unit: "unit", unitCost: 4.5, total: 900 },
    ],
  };
}

export default function DocumentIntelligenceClient() {
  const [docs, setDocs] = useState<ExtractedDoc[]>([]);
  const [message, setMessage] = useState("");

  async function handleUpload(files: FileList | null, docType: "invoice" | "purchase-order") {
    if (!files?.length) return;
    const extracted = Array.from(files).map((file) => mockExtract(file, docType));
    setDocs((current) => [...extracted, ...current]);
    setMessage(`${extracted.length} document(s) extracted. Review supplier match and duplicate risk before approving import.`);
  }

  function approveImport(id: string) {
    setDocs((current) => current.map((doc) => (doc.id === id ? { ...doc, status: "Approved for import" } : doc)));
    setMessage("Document approved for import into invoice / PO workflow.");
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Document Intelligence",
        title: "Document Intelligence Centre",
        subtitle: "Extract supplier invoices and purchase orders with explainable risk signals before import.",
        outcomes: ["Accelerate document extraction", "Flag duplicate-risk records early", "Route approved documents into workflow confidently"],
        formulas: ["Extracted Total = Sum(Line Qty x Unit Cost)", "Duplicate Risk = Name and pattern risk detection", "Approval Status = Extracted > Approved for import"],
        intelligenceItems: [
          { label: "Documents processed", detail: `${docs.length} records currently staged` },
          { label: "Risk control", detail: "Duplicate invoice signal displayed before posting" },
          { label: "Workflow readiness", detail: "Supplier, ingredient, and product match links remain in-context" },
        ],
      }}
    >
      <section className="grid gap-6">
        <div className="rounded-[2rem] border border-violet-200 bg-violet-50 p-6">
        <h2 className="text-xl font-black text-[#F8FAFC]">VYRON COST Document Intelligence</h2>
        <p className="mt-3 text-sm leading-7 text-violet-950">
          Email invoices and purchase orders directly to VYRON COST and let AI extract, match and flag risks. Upload PDF or
          image files now; email inbox intake is configured for production rollout.
        </p>
        <div className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700">
          Email intake placeholder: <span className="font-black text-violet-700">documents@handcrafted.vyroncost.com</span>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <label className="cursor-pointer rounded-[2rem] border border-white bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <FileUp className="text-[#7E22CE]" />
            <div className="font-black text-[#F8FAFC]">Upload invoice PDF/image</div>
          </div>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => handleUpload(e.target.files, "invoice")} />
          <div className="mt-3 text-xs text-slate-500">Extract supplier, invoice number, date and lines</div>
        </label>
        <label className="cursor-pointer rounded-[2rem] border border-white bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Upload className="text-[#7E22CE]" />
            <div className="font-black text-[#F8FAFC]">Upload purchase order PDF/image</div>
          </div>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => handleUpload(e.target.files, "purchase-order")} />
          <div className="mt-3 text-xs text-slate-500">Extract PO header, supplier and line items</div>
        </label>
        <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-6">
          <div className="flex items-center gap-3">
            <Mail className="text-slate-500" />
            <div className="font-black text-[#F8FAFC]">Email-in inbox</div>
          </div>
          <div className="mt-3 text-xs text-slate-500">Forward supplier documents to the intake address above</div>
          <Link href="/invoice-forensics" className="mt-4 inline-flex text-xs font-black text-violet-700">
            Open invoice forensics →
          </Link>
        </div>
      </div>

      {message ? <div className="rounded-xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3 text-sm font-black text-[#4D7C0F]">{message}</div> : null}

        <div className="space-y-4">
        {docs.length === 0 ? (
          <VyronPremiumEmptyState
            title="Document Intake Empty"
            steps={[
              "Upload an invoice or purchase order file",
              "Review extraction and risk indicators",
              "Approve records for downstream import",
            ]}
          />
        ) : (
          docs.map((doc) => (
            <div key={doc.id} className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase text-slate-400">{doc.docType === "invoice" ? "Invoice" : "Purchase Order"}</div>
                  <div className="mt-1 text-xl font-black text-[#F8FAFC]">{doc.fileName}</div>
                  <div className="mt-2 text-sm text-slate-600">
                    Status: {doc.status} · Supplier: {doc.supplier} · {doc.documentNumber} · {doc.documentDate}
                  </div>
                  {doc.duplicateRisk ? (
                    <div className="mt-2 inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
                      Duplicate invoice risk flagged
                    </div>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className="text-xs font-black uppercase text-slate-400">Extracted total</div>
                  <div className="text-2xl font-black text-violet-700">{formatMoney(doc.total)}</div>
                  <button
                    type="button"
                    onClick={() => approveImport(doc.id)}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-transparent vyron-grad-surface px-4 py-2 text-xs font-black text-[#F8FAFC]"
                  >
                    <CheckCircle2 size={14} />
                    Approve import
                  </button>
                </div>
              </div>
              <div className="mt-5 overflow-hidden rounded-xl border border-slate-100">
                <div className="grid grid-cols-5 bg-slate-50 px-4 py-3 text-xs font-black uppercase text-slate-500">
                  <div className="col-span-2">Line</div>
                  <div>Qty</div>
                  <div>Unit cost</div>
                  <div>Total</div>
                </div>
                {doc.lines.map((line) => (
                  <div key={`${doc.id}-${line.description}`} className="grid grid-cols-5 border-t border-slate-100 px-4 py-3 text-sm">
                    <div className="col-span-2 font-black">{line.description}</div>
                    <div>
                      {line.qty} {line.unit}
                    </div>
                    <div>{formatMoney(line.unitCost)}</div>
                    <div className="font-black">{formatMoney(line.total)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-black">
                <Link href="/suppliers" className="text-[#7E22CE]">
                  Match supplier →
                </Link>
                <Link href="/ingredients" className="text-[#7E22CE]">
                  Match ingredient →
                </Link>
                <Link href="/products" className="text-[#7E22CE]">
                  Match product →
                </Link>
              </div>
            </div>
          ))
        )}
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
