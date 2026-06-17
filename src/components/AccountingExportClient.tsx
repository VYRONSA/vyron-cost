"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

type ExportJob = {
  id: string;
  title: string;
  description: string;
  endpoint: string;
  futureErp?: string;
};

const JOBS: ExportJob[] = [
  { id: "invoices", title: "Supplier Invoices", description: "Approved invoices for AP posting.", endpoint: "/api/finance-exports/invoices" },
  { id: "pos", title: "Purchase Orders", description: "PO headers and totals.", endpoint: "/api/finance-exports/purchase-orders" },
  { id: "grns", title: "GRNs", description: "Goods received notes.", endpoint: "/api/finance-exports/grns" },
  { id: "inventory", title: "Inventory Adjustments", description: "Stock ledger adjustments.", endpoint: "/api/finance-exports/inventory-adjustments" },
  { id: "production", title: "Production Journals", description: "Completed production cost journals.", endpoint: "/api/finance-exports/production-journals" },
  { id: "recovery", title: "Recovery Journals", description: "Recovered value entries.", endpoint: "/api/finance-exports/recovery-journals" },
  { id: "costs", title: "Cost Updates", description: "Ingredient and product cost changes.", endpoint: "/api/finance-exports/cost-updates" },
];

const ERP_READY = ["Xero", "Sage", "QuickBooks", "VYRON FINANCE"];

function downloadRows(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  XLSX.writeFile(wb, filename);
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AccountingExportClient() {
  const [busy, setBusy] = useState<string | null>(null);

  async function runExport(job: ExportJob, format: "excel" | "csv") {
    setBusy(`${job.id}-${format}`);
    try {
      const res = await fetch(job.endpoint);
      const data = await res.json();
      if (!data.ok || !data.rows?.length) return;
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "excel") downloadRows(`vyron-${job.id}-${stamp}.xlsx`, data.rows);
      else downloadCsv(`vyron-${job.id}-${stamp}.csv`, data.rows);
    } finally {
      setBusy(null);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "finance",
        title: "Accounting Export",
        subtitle: "Premium VYRON COST workflow for accounting export.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-8">
            <div className="rounded-[2rem] border border-indigo-200 bg-indigo-50 p-6">
              <div className="text-xs font-black uppercase text-indigo-600">Future-ready ERP connectors</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {ERP_READY.map((erp) => (
                  <span key={erp} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-indigo-900">
                    {erp}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {JOBS.map((job) => (
                <article key={job.id} className="rounded-[2rem] bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-black text-slate-900">{job.title}</h3>
                  <p className="mt-2 text-sm font-semibold text-slate-600">{job.description}</p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => runExport(job, "excel")}
                      className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-[#F8FAFC] disabled:opacity-50"
                    >
                      {busy === `${job.id}-excel` ? "…" : "Excel"}
                    </button>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => runExport(job, "csv")}
                      className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-4 py-2 text-xs font-black disabled:opacity-50"
                    >
                      <Download size={14} /> {busy === `${job.id}-csv` ? "…" : "CSV"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
