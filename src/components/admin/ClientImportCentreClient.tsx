"use client";

import { Download, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import {
  defaultImportHistory,
  importTemplates,
  parseCsvText,
  templateToCsv,
  type ImportEntityType,
  type ImportHistoryEntry,
} from "@/lib/vyron-import-centre";
import { useAdminPermissions } from "@/hooks/useModulePermissions";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const CLIENT_IMPORT_TYPES: ImportEntityType[] = [
  "suppliers",
  "ingredients",
  "products",
  "recipes",
  "bom-lines",
  "opening-stock",
  "stock-counts",
  "packaging",
];

export default function ClientImportCentreClient() {
  const { canImports } = useAdminPermissions();
  const [selected, setSelected] = useState<ImportEntityType>("suppliers");
  const [fileName, setFileName] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [validCount, setValidCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [validRows, setValidRows] = useState<Record<string, string>[]>([]);
  const [history, setHistory] = useState<ImportHistoryEntry[]>(defaultImportHistory());

  const availableTemplates = useMemo(
    () => importTemplates.filter((item) => CLIENT_IMPORT_TYPES.includes(item.id) || item.id === "products"),
    []
  );

  const customerTemplate = importTemplates.find((item) => item.id === "suppliers");
  const templates = useMemo(() => {
    const base = availableTemplates;
    if (!base.some((item) => item.label.toLowerCase().includes("customer")) && customerTemplate) {
      return [
        { ...customerTemplate, id: "suppliers" as ImportEntityType, label: "Customers", description: "Customer master import" },
        ...base,
      ];
    }
    return base;
  }, [availableTemplates, customerTemplate]);

  const template = templates.find((item) => item.id === selected) || templates[0];

  async function handleUpload(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const result = parseCsvText(text, template);
    setValidRows(result.validRows);
    setValidCount(result.validRows.length);
    setInvalidCount(result.invalidRows.length);
    setErrors(result.invalidRows.flatMap((row) => row.errors.map((err) => `Row ${row.rowNumber}: ${err}`)));
    setValidationMessage(
      result.invalidRows.length
        ? `Validated ${result.validRows.length} valid rows · ${result.invalidRows.length} rejected`
        : `Validated ${result.validRows.length} rows — ready to import`
    );
  }

  function downloadTemplate() {
    const csv = templateToCsv(template);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vyron-${template.id}-template.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importValidRows() {
    if (!canImports) {
      setValidationMessage("You do not have permission to run imports.");
      return;
    }
    if (!validCount) {
      setValidationMessage("Upload and validate a file first.");
      return;
    }
    setValidationMessage("Importing…");
    const data = await fetch("/api/workspace/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: template.id,
        fileName: fileName || `${template.id}.csv`,
        rows: validRows,
      }),
    }).then((res) => res.json());

    if (!data.ok) {
      setValidationMessage(data.error || "Import failed.");
      return;
    }

    setHistory((current) => [
      {
        id: crypto.randomUUID(),
        entity: template.label,
        fileName: fileName || `${template.id}.csv`,
        importedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
        validRows: data.imported ?? validCount,
        rejectedRows: data.skipped ?? invalidCount,
        status: data.errors?.length ? "Partial" : "Completed",
      },
      ...current,
    ]);
    setValidationMessage(
      data.errors?.length
        ? `Imported ${data.imported} rows · ${data.skipped} skipped · ${data.errors.length} errors`
        : `Imported ${data.imported} valid rows into ${template.label}.`
    );
    if (data.errors?.length) setErrors(data.errors);
  }

  return (
    <VyronPremiumPageShell
      config={{
        title: "Client Import Centre",
        subtitle: "Premium VYRON COST workflow for client import centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-black text-slate-950">Import Centre</h2>
              <p className="mt-2 text-sm text-slate-500">Download CSV templates, validate uploads and import setup data for your workspace.</p>
              <div className="mt-4 space-y-2">
                {templates.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelected(item.id);
                      setValidationMessage("");
                      setValidCount(0);
                      setInvalidCount(0);
                      setErrors([]);
                      setValidRows([]);
                    }}
                    className={`w-full rounded-2xl border px-4 py-3 text-left ${selected === item.id ? "border-violet-400 bg-violet-50" : "border-slate-100 bg-white"}`}
                  >
                    <div className="text-sm font-black text-slate-950">{item.label}</div>
                    <div className="text-xs font-semibold text-slate-500">{item.description}</div>
                  </button>
                ))}
              </div>
            </div>
      
            <div className="space-y-6">
              <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 px-4 py-3 text-sm font-black text-violet-800">
                    <Download size={16} /> Download Template
                  </button>
                  {canImports ? (
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl vyron-grad-surface px-4 py-3 text-sm font-semibold text-white">
                      <Upload size={16} /> Upload File
                      <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void handleUpload(e.target.files?.[0] || null)} />
                    </label>
                  ) : null}
                </div>
                {validationMessage ? <p className="mt-4 text-sm font-bold text-[var(--vyron-success-fg)]">{validationMessage}</p> : null}
                {errors.length ? (
                  <div className="mt-4 max-h-40 overflow-y-auto rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-800">
                    {errors.map((error) => <div key={error}>{error}</div>)}
                  </div>
                ) : null}
                {canImports ? (
                  <button type="button" onClick={importValidRows} className="mt-4 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white">
                    Import Valid Rows
                  </button>
                ) : null}
              </div>
      
              <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-black text-slate-950">Import History</h3>
                <div className="mt-4 space-y-3">
                  {history.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-slate-100 px-4 py-3 text-sm">
                      <div className="font-black text-slate-950">{entry.entity}</div>
                      <div className="text-xs font-semibold text-slate-500">
                        {entry.fileName} · {entry.importedAt} · {entry.validRows} valid / {entry.rejectedRows} rejected · {entry.status}
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
