"use client";

import { Download, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { useAdminPermissions } from "@/hooks/useModulePermissions";
import {
  defaultImportHistory,
  importTemplates,
  parseCsvText,
  templateToCsv,
  type ImportEntityType,
  type ImportHistoryEntry,
} from "@/lib/vyron-import-centre";

export default function ImportsCentreClient() {
  const { canImports } = useAdminPermissions();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ImportEntityType>("ingredients");
  const [fileName, setFileName] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [validCount, setValidCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [history, setHistory] = useState<ImportHistoryEntry[]>(defaultImportHistory());

  const template = importTemplates.find((item) => item.id === selected)!;

  const filteredTemplates = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return importTemplates;
    return importTemplates.filter((item) =>
      [item.label, item.description, item.columns.join(" ")].join(" ").toLowerCase().includes(term)
    );
  }, [search]);

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

  async function handleUpload(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const result = parseCsvText(text, template);
    setValidCount(result.validRows.length);
    setInvalidCount(result.invalidRows.length);
    setErrors(result.invalidRows.flatMap((row) => row.errors.map((err) => `Row ${row.rowNumber}: ${err}`)));
    setValidationMessage(
      result.invalidRows.length
        ? `Validated ${result.validRows.length} valid rows · ${result.invalidRows.length} rejected`
        : `Validated ${result.validRows.length} rows — ready to import`
    );
  }

  function importValidRows() {
    if (!canImports) {
      setValidationMessage("You do not have permission to run imports.");
      return;
    }
    if (!validCount) {
      setValidationMessage("Upload and validate a file first.");
      return;
    }
    setHistory((current) => [
      {
        id: crypto.randomUUID(),
        entity: template.label,
        fileName: fileName || `${template.id}.csv`,
        importedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
        validRows: validCount,
        rejectedRows: invalidCount,
        status: invalidCount ? "Partial" : "Completed",
      },
      ...current,
    ]);
    setValidationMessage(`Imported ${validCount} valid rows into ${template.label}.`);
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Import Intelligence",
        title: "Imports Command Centre",
        subtitle: "Validate and import structured CSV data with quality controls and traceable import history.",
        outcomes: ["Standardize bulk data onboarding", "Reject invalid rows before import", "Maintain auditable import history"],
        formulas: ["Validated Rows = Parsed rows - Invalid rows", "Import Status = Completed or Partial by rejects", "Template Match enforces required columns"],
        intelligenceItems: [
          { label: "Template types", detail: `${importTemplates.length} import entities available` },
          { label: "Current template", detail: template.label },
          { label: "Import history", detail: `${history.length} historical import entries` },
        ],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-black text-slate-950">Bulk Import Centre</h2>
        <p className="mt-2 text-sm text-slate-500">
          Download CSV templates, upload data, validate rows and import valid records.
        </p>
        <div className="mt-5">
          <SearchFilterBar value={search} onChange={setSearch} placeholder="Search import types..." resultCount={filteredTemplates.length} />
        </div>
        <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto">
          {filteredTemplates.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSelected(item.id);
                setValidationMessage("");
                setValidCount(0);
                setInvalidCount(0);
                setErrors([]);
              }}
              className={`block w-full rounded-2xl border px-4 py-3 text-left transition ${
                selected === item.id ? "border-[#B6D934] bg-[#A855F7]/10" : "border-slate-100 bg-slate-50 hover:bg-white"
              }`}
            >
              <div className="font-black text-slate-950">{item.label}</div>
              <div className="mt-1 text-xs text-slate-500">{item.description}</div>
            </button>
          ))}
        </div>
      </div>

        <div className="space-y-6">
        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-950">{template.label}</h3>
              <p className="mt-1 text-sm text-slate-500">Columns: {template.columns.join(", ")}</p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 rounded-xl bg-[#08111A] px-4 py-3 text-xs font-black text-[#B6D934]"
            >
              <Download size={16} />
              Download CSV Template
            </button>
          </div>

          {canImports ? (
            <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 transition hover:border-[#B6D934]">
              <Upload size={28} className="text-[#7E22CE]" />
              <div className="mt-3 text-sm font-black text-slate-950">Upload CSV</div>
              <div className="mt-1 text-xs text-slate-500">{fileName || "Choose file to validate"}</div>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => handleUpload(event.target.files?.[0] || null)}
              />
            </label>
          ) : null}

          {validationMessage ? (
            <div className="mt-4 rounded-xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3 text-sm font-black text-[#4D7C0F]">{validationMessage}</div>
          ) : null}

          {errors.length ? (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              {errors.slice(0, 8).map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          ) : null}

          {canImports ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={importValidRows}
                className="rounded-xl border border-transparent vyron-grad-surface px-5 py-3 text-sm font-black text-[#F8FAFC]"
              >
                Import Valid Rows
              </button>
              <button
                type="button"
                onClick={() => {
                  setInvalidCount(0);
                  setErrors([]);
                  setValidationMessage("Invalid rows rejected. Ready to re-upload.");
                }}
                className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700"
              >
                Reject Invalid Rows
              </button>
            </div>
          ) : null}
        </div>

        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
          <h3 className="text-lg font-black text-slate-950">Import history</h3>
          <div className="mt-4 space-y-2">
            {history.map((entry) => (
              <div key={entry.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <div className="font-black text-slate-950">
                  {entry.entity} · {entry.fileName}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {entry.importedAt} · {entry.validRows} imported · {entry.rejectedRows} rejected · {entry.status}
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
