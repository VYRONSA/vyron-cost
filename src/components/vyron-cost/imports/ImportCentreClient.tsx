"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import {
  getImportCentreTemplate,
  importCentreTemplates,
  parseImportCentreCsv,
  type ImportCentreModule,
  type ImportCentreStats,
} from "@/lib/vyron-import-centre-v1";
import { useWorkspacePermissions } from "@/hooks/useWorkspacePermissions";

const M = VYRON_MASTER;

type ValidationState = {
  validRows: Record<string, string>[];
  invalidRows: Array<{ rowNumber: number; row: Record<string, string>; errors: string[] }>;
  preview: Record<string, string>[];
  missingIngredients?: string[];
  missingFinishedGoods?: string[];
};

const emptyValidation: ValidationState = {
  validRows: [],
  invalidRows: [],
  preview: [],
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function rowsFromWorkbook(buffer: ArrayBuffer, columns: string[]) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return raw.map((row) => {
    const normalized = new Map<string, string>();
    for (const [key, value] of Object.entries(row)) {
      normalized.set(normalizeHeader(String(key)), String(value ?? "").trim());
    }
    const mapped: Record<string, string> = {};
    for (const column of columns) {
      mapped[column] = normalized.get(normalizeHeader(column)) ?? "";
    }
    return mapped;
  });
}

export default function ImportCentreClient() {
  const { can } = useWorkspacePermissions();
  const canView = can("ingredients.view");
  const canImport = can("admin.imports");

  const [selected, setSelected] = useState<ImportCentreModule>("raw-materials");
  const [stats, setStats] = useState<ImportCentreStats>({
    rawMaterials: 0,
    finishedGoods: 0,
    boms: 0,
  });
  const [fileName, setFileName] = useState("");
  const [validation, setValidation] = useState<ValidationState>(emptyValidation);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createMissingMaterials, setCreateMissingMaterials] = useState(false);

  const template = useMemo(() => getImportCentreTemplate(selected), [selected]);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch("/api/import-centre/stats");
      const data = await response.json();
      if (data.ok && data.stats) setStats(data.stats as ImportCentreStats);
    } catch {
      // non-blocking
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  function resetValidation() {
    setValidation(emptyValidation);
    setMessage("");
    setError("");
    setFileName("");
    setCreateMissingMaterials(false);
  }

  async function validateRows(module: ImportCentreModule, rows: Record<string, string>[]) {
    const response = await fetch("/api/import-centre/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module, rows }),
    });
    const data = await response.json();
    if (!data.ok) {
      setError(data.error || "Validation failed.");
      setValidation(emptyValidation);
      return;
    }
    setError("");
    setValidation({
      validRows: data.validRows || [],
      invalidRows: data.invalidRows || [],
      preview: data.preview || [],
      missingIngredients: data.missingIngredients,
      missingFinishedGoods: data.missingFinishedGoods,
    });
    setMessage(
      `Validated ${data.validRows?.length || 0} row(s) · ${data.invalidRows?.length || 0} rejected`
    );
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    resetValidation();
    setFileName(file.name);
    setBusy(true);

    try {
      const lower = file.name.toLowerCase();
      let rows: Record<string, string>[] = [];

      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        rows = rowsFromWorkbook(buffer, template.columns);
      } else {
        const text = await file.text();
        const parsed = parseImportCentreCsv(selected, text);
        rows = [
          ...parsed.validRows,
          ...parsed.invalidRows.map((item) => item.row),
        ].filter((row) => Object.values(row).some((value) => String(value || "").trim()));
      }

      if (!rows.length) {
        setError("No data rows found in file.");
        return;
      }

      await validateRows(selected, rows);
    } catch {
      setError("Could not read upload file.");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const anchor = document.createElement("a");
    anchor.href = `/api/import-centre/template?module=${selected}`;
    anchor.download = `vyron-${selected}-template.csv`;
    anchor.click();
  }

  async function runImport() {
    if (!canImport) {
      setError("You do not have permission to run imports.");
      return;
    }
    if (!validation.validRows.length) {
      setError("Upload and validate a file first.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("Importing…");

    try {
      const response = await fetch("/api/import-centre/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: selected,
          rows: validation.validRows,
          fileName: fileName || `${selected}.csv`,
          createMissingMaterials,
        }),
      });
      const data = await response.json();

      if (!data.ok) {
        setError(data.error || "Import failed.");
        if (data.missingIngredients || data.missingFinishedGoods) {
          setValidation((current) => ({
            ...current,
            missingIngredients: data.missingIngredients,
            missingFinishedGoods: data.missingFinishedGoods,
          }));
        }
        return;
      }

      const extras: string[] = [];
      if (data.createdCategories) extras.push(`${data.createdCategories} categories`);
      if (data.createdSuppliers) extras.push(`${data.createdSuppliers} suppliers`);
      if (data.createdMaterials) extras.push(`${data.createdMaterials} materials`);

      setMessage(
        `Imported ${data.imported} record(s)` +
          (data.skipped ? ` · ${data.skipped} skipped` : "") +
          (extras.length ? ` · Created ${extras.join(", ")}` : "")
      );
      setError(data.errors?.length ? data.errors.slice(0, 8).join(" · ") : "");
      await loadStats();
    } catch {
      setError("Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Master Data",
        title: "Import Centre",
        subtitle: "Download templates, validate uploads, and import raw materials, finished goods, and BOMs.",
        outcomes: [
          "Workspace-scoped imports with validation preview",
          "Auto-create categories and suppliers via Contact Master",
          "BOM imports with missing material checks",
        ],
      }}
    >
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Raw Material Count", value: stats.rawMaterials },
            { label: "Finished Goods Count", value: stats.finishedGoods },
            { label: "BOM Count", value: stats.boms },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4">
              <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">{card.label}</div>
              <div className="mt-2 text-3xl font-black text-[#0F172A]">
                {loading ? "—" : card.value}
              </div>
            </div>
          ))}
        </section>

        {message ? (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className={`${M.moduleDataSection} space-y-3`}>
            <h2 className="text-lg font-black text-[#0F172A]">Import Modules</h2>
            {importCentreTemplates.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelected(item.id);
                  resetValidation();
                }}
                className={`w-full rounded-2xl border px-4 py-3 text-left ${
                  selected === item.id
                    ? "border-[#0F172A] bg-[#F8FAFC]"
                    : "border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]"
                }`}
              >
                <div className="text-sm font-black text-[#0F172A]">{item.label}</div>
                <div className="mt-1 text-xs font-semibold text-[#64748B]">{item.description}</div>
              </button>
            ))}
          </div>

          <div className={`${M.moduleDataSection} space-y-5`}>
            <div>
              <h2 className="text-lg font-black text-[#0F172A]">{template.label}</h2>
              <p className="mt-1 text-sm font-medium text-[#64748B]">{template.description}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadTemplate}
                className={`${M.secondaryBtn} inline-flex items-center gap-2 px-4 py-2.5 text-sm`}
              >
                <Download size={16} />
                Download CSV Template
              </button>
              {canView ? (
                <label className={`${M.primaryBtn} inline-flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm`}>
                  <Upload size={16} />
                  Upload CSV/Excel
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv"
                    className="hidden"
                    onChange={(event) => void handleUpload(event.target.files?.[0] || null)}
                  />
                </label>
              ) : null}
            </div>

            {fileName ? (
              <div className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs font-bold text-[#334155]">
                <FileSpreadsheet size={14} />
                {fileName}
              </div>
            ) : null}

            {selected === "boms" && validation.missingIngredients?.length ? (
              <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-900">
                <div className="font-black">Missing raw materials</div>
                <div className="mt-2 font-semibold">{validation.missingIngredients.join(", ")}</div>
                {canImport ? (
                  <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={createMissingMaterials}
                      onChange={(event) => setCreateMissingMaterials(event.target.checked)}
                      className="h-4 w-4 rounded border-[#CBD5E1]"
                    />
                    Create missing materials during import
                  </label>
                ) : null}
              </div>
            ) : null}

            {selected === "boms" && validation.missingFinishedGoods?.length ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                Missing finished goods: {validation.missingFinishedGoods.join(", ")}
              </div>
            ) : null}

            {validation.preview.length ? (
              <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
                <table className="min-w-full">
                  <thead className={VYRON_TABLE.head}>
                    <tr>
                      {template.columns.map((column) => (
                        <th key={column} className="px-3 py-2 text-left text-xs">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validation.preview.map((row, index) => (
                      <tr key={index} className={VYRON_TABLE.row}>
                        {template.columns.map((column) => (
                          <td key={column} className="px-3 py-2 text-xs text-[#334155]">
                            {row[column] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {validation.invalidRows.length ? (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
                {validation.invalidRows.map((row) => (
                  <div key={row.rowNumber}>
                    Row {row.rowNumber}: {row.errors.join(", ")}
                  </div>
                ))}
              </div>
            ) : null}

            {canImport ? (
              <button
                type="button"
                disabled={busy || !validation.validRows.length}
                onClick={() => void runImport()}
                className={`${M.primaryBtn} px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {busy ? "Working…" : "Import Valid Rows"}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </VyronPremiumPageShell>
  );
}
