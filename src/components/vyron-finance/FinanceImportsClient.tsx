"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { financeImportTemplates, type FinanceImportType } from "@/lib/vyron-finance-import-templates";
import { parseCsvText } from "@/lib/vyron-import-centre";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function templateToCsv(columns: string[], sampleRow: string[]) {
  return `${columns.join(",")}\n${sampleRow.join(",")}\n`;
}

export default function FinanceImportsClient() {
  const [selected, setSelected] = useState<FinanceImportType>("trial-balance");
  const [result, setResult] = useState<{ valid: number; rejected: number } | null>(null);
  const template = financeImportTemplates.find((t) => t.id === selected)!;

  function downloadTemplate() {
    const blob = new Blob([templateToCsv(template.columns, template.sampleRow)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vyron-finance-${selected}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsvText(String(reader.result), {
        id: "ingredients",
        label: template.label,
        description: template.description,
        columns: template.columns,
        sampleRow: template.sampleRow,
      });
      setResult({ valid: parsed.validRows.length, rejected: parsed.invalidRows.length });
    };
    reader.readAsText(file);
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "finance",
        title: "Finance Imports",
        subtitle: "Premium VYRON COST workflow for finance imports.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <div className="space-y-2">
              {financeImportTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelected(t.id);
                    setResult(null);
                  }}
                  className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-black ${selected === t.id ? "vyron-grad-surface text-white" : "bg-white text-slate-800"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="rounded-[2rem] bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">{template.label}</h2>
              <p className="mt-2 text-sm text-slate-600">{template.description}</p>
              <p className="mt-2 text-xs font-bold text-slate-500">Supports CSV and Excel (.xlsx via export from template)</p>
              <button
                type="button"
                onClick={downloadTemplate}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white"
              >
                <Download size={16} /> Download CSV template
              </button>
              <label className="mt-6 block">
                <span className="text-xs font-black uppercase text-slate-400">Upload file</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv"
                  className="mt-2 block w-full text-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                  }}
                />
              </label>
              {result ? (
                <div className="mt-4 rounded-xl border border-[#A855F7]/20 bg-[#A855F7]/10 p-4 text-sm font-bold text-[#4D7C0F]">
                  Valid rows: {result.valid} · Rejected: {result.rejected}
                </div>
              ) : null}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
