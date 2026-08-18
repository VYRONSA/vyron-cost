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

/**
 * Entities offered by the Client Import Centre.
 *
 * DATA INTEGRITY: this list maps one-to-one onto `importTemplates` ids, and each
 * id is the entity `persistImportRows` writes. A label must never be attached to
 * a different entity's id — customers previously appeared here backed by the
 * "suppliers" id, which wrote customer records into `vyron_cost_suppliers`.
 * `customers` is a first-class entity with its own template and its own
 * persistence branch; it is listed here directly.
 */
const CLIENT_IMPORT_TYPES: ImportEntityType[] = [
  "customers",
  "suppliers",
  "ingredients",
  "products",
  "recipes",
  "bom-lines",
  "opening-stock",
  "stock-counts",
  "packaging",
  "customer-price-list-items",
  "customer-invoices",
  "supplier-invoices",
  "product-mappings",
];

/** Grouping for the card list. Presentation only — ids are unchanged. */
const IMPORT_SECTIONS: { title: string; ids: ImportEntityType[] }[] = [
  { title: "CUSTOMER COMMERCIAL", ids: ["customers", "customer-price-list-items", "customer-invoices"] },
  { title: "SUPPLIER / PROCUREMENT", ids: ["suppliers", "supplier-invoices"] },
  { title: "PRODUCT / COSTING", ids: ["products", "ingredients", "recipes", "bom-lines", "product-mappings"] },
  { title: "INVENTORY", ids: ["opening-stock", "stock-counts", "packaging"] },
];

/** Entities where a silent partial import would corrupt accounting figures. */
const PREVIEW_REQUIRED: ImportEntityType[] = ["customer-invoices"];

type ProductMapping = {
  id: string;
  source_item_code: string | null;
  source_description: string | null;
  product_id: string;
};

type InvoicePreview = {
  invoicesDetected: number;
  linesDetected: number;
  customersMatched: number;
  customersUnresolved: string[];
  productsMapped: number;
  productsUnresolved: string[];
  missingItemCodeLines: number;
  invoicesEligible: number;
  invoicesBlocked: number;
  insertCount: number;
  updateCount: number;
  totalSales: number;
  totalVat: number;
  totalPaid: number;
  totalOutstanding: number;
  warnings: string[];
  errors: string[];
};

type PreviewResponse = { ok?: boolean; error?: string; preview?: InvoicePreview };

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
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [products, setProducts] = useState<{ id: string; product_name: string }[]>([]);
  const [mapCode, setMapCode] = useState("");
  const [mapProductId, setMapProductId] = useState("");
  const [mapMessage, setMapMessage] = useState("");

  const needsPreview = PREVIEW_REQUIRED.includes(selected);

  async function loadMappings() {
    const data = await fetch("/api/workspace/admin/product-mappings").then((res) => res.json());
    if (data.ok) {
      setMappings(data.mappings || []);
      setProducts(data.products || []);
    } else {
      setMapMessage(data.error || "Failed to load mappings.");
    }
  }

  async function saveMapping() {
    if (!mapCode.trim() || !mapProductId) {
      setMapMessage("Enter an accounting item code and choose a VYRON product.");
      return;
    }
    const data = await fetch("/api/workspace/admin/product-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceItemCode: mapCode.trim(), productId: mapProductId }),
    }).then((res) => res.json());
    if (!data.ok) {
      setMapMessage(data.error || "Failed to save mapping.");
      return;
    }
    setMapMessage(data.updated ? "Mapping updated." : "Mapping saved.");
    setMapCode("");
    setMapProductId("");
    await loadMappings();
  }

  /** Dry run. Writes nothing — the operator must review before importing. */
  async function runPreview() {
    if (!validCount) {
      setValidationMessage("Upload and validate a file first.");
      return;
    }
    setPreviewing(true);
    setValidationMessage("Running preview…");
    setErrors([]);

    /**
     * Every exit path must clear the loading state. A rejected fetch or a
     * non-JSON body (a gateway timeout returns HTML) previously left the UI
     * stuck on "Running preview…" with no way back.
     */
    try {
      const response = await fetch("/api/workspace/admin/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: template.id, rows: validRows }),
      });

      const raw = await response.text();
      let data: PreviewResponse | null = null;
      try {
        data = JSON.parse(raw) as PreviewResponse;
      } catch {
        setValidationMessage(`Preview failed — server returned HTTP ${response.status}.`);
        setErrors([raw.slice(0, 400) || "The server returned a non-JSON response."]);
        return;
      }

      if (!response.ok || !data?.ok) {
        setValidationMessage(data?.error || `Preview failed (HTTP ${response.status}).`);
        if (data?.error) setErrors([data.error]);
        return;
      }

      setPreview(data.preview as InvoicePreview);
      setValidationMessage("Preview complete — review below, then confirm the import.");
    } catch (error) {
      setValidationMessage("Preview failed — the request could not be completed.");
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setPreviewing(false);
    }
  }

  /**
   * Templates are taken verbatim from the shared registry, preserving each
   * template's own id. No template is re-labelled onto another entity's id —
   * the label a user reads and the table the rows are written to must always
   * agree. Ordered so Customers and Suppliers lead, as before.
   */
  const templates = useMemo(
    () =>
      CLIENT_IMPORT_TYPES.map((id) => importTemplates.find((item) => item.id === id)).filter(
        (item): item is (typeof importTemplates)[number] => Boolean(item)
      ),
    []
  );

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
    if (needsPreview && !preview) {
      setValidationMessage("Run the preview first, then confirm the import.");
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
    // Per-outcome counters are present for entities that report them (suppliers
    // today). Fall back to the original summary for entities that do not, so no
    // existing behaviour changes.
    const hasOutcomes = typeof data.inserted === "number" || typeof data.updated === "number";
    if (hasOutcomes) {
      const parts = [
        `${data.inserted ?? 0} inserted`,
        `${data.updated ?? 0} updated`,
        `${data.duplicate ?? 0} duplicate`,
        `${data.skippedRows ?? 0} skipped`,
        `${data.failed ?? 0} failed`,
      ];
      setValidationMessage(`${template.label}: ${parts.join(" · ")}`);
    } else {
      setValidationMessage(
        data.errors?.length
          ? `Imported ${data.imported} rows · ${data.skipped} skipped · ${data.errors.length} errors`
          : `Imported ${data.imported} valid rows into ${template.label}.`
      );
    }

    const messages: string[] = [...(data.errors || [])];
    // Fuzzy near-matches are never merged automatically — surface them for a decision.
    for (const item of data.review || []) {
      const best = item.candidates?.[0];
      if (!best) continue;
      messages.push(
        `Row ${item.row}: "${item.name}" created, but ${Math.round(best.similarity * 100)}% similar to existing "${best.supplierName}" — review for a possible duplicate.`
      );
    }
    if (messages.length) setErrors(messages);
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
              <div className="mt-4 space-y-5">
                {IMPORT_SECTIONS.map((section) => {
                  const items = section.ids
                    .map((id) => templates.find((item) => item.id === id))
                    .filter((item): item is (typeof templates)[number] => Boolean(item));
                  if (!items.length) return null;
                  return (
                    <div key={section.title} className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                        {section.title}
                      </div>
                      {items.map((item) => (
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
                            setPreview(null);
                            // Selecting Product Mapping loads the existing
                            // mapping list and product options for the panel.
                            if (item.id === "product-mappings") void loadMappings();
                          }}
                          className={`w-full rounded-2xl border px-4 py-3 text-left ${selected === item.id ? "border-violet-400 bg-violet-50" : "border-slate-100 bg-white"}`}
                        >
                          <div className="text-sm font-black text-slate-950">{item.label}</div>
                          <div className="text-xs font-semibold text-slate-500">{item.description}</div>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
      
            <div className="space-y-6">
              <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 px-4 py-3 text-sm font-black text-violet-800">
                    <Download size={16} />
                    {template.id === "customer-invoices"
                      ? "Download Standard VYRON Customer Invoice Template"
                      : template.id === "supplier-invoices"
                        ? "Download Standard VYRON Supplier Invoice Template"
                        : "Download Template"}
                  </button>
                  {canImports ? (
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl vyron-grad-surface px-4 py-3 text-sm font-semibold text-white">
                      <Upload size={16} /> Upload File
                      <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void handleUpload(e.target.files?.[0] || null)} />
                    </label>
                  ) : null}
                </div>
                {template.instructions?.length ? (
                  <ul className="mt-4 space-y-1 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
                    {template.instructions.map((line) => (
                      <li key={line}>• {line}</li>
                    ))}
                  </ul>
                ) : null}
                {validationMessage ? <p className="mt-4 text-sm font-bold text-[var(--vyron-success-fg)]">{validationMessage}</p> : null}
                {errors.length ? (
                  <div className="mt-4 max-h-40 overflow-y-auto rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-800">
                    {errors.map((error) => <div key={error}>{error}</div>)}
                  </div>
                ) : null}
                {canImports && needsPreview ? (
                  <button
                    type="button"
                    onClick={() => void runPreview()}
                    disabled={previewing}
                    className="mt-4 mr-3 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-black text-violet-800 disabled:opacity-50"
                  >
                    {previewing ? "Running preview…" : "Run Preview"}
                  </button>
                ) : null}
                {canImports ? (
                  <button type="button" onClick={importValidRows} className="mt-4 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50" disabled={needsPreview && !preview}>
                    {needsPreview ? "Confirm Import" : "Import Valid Rows"}
                  </button>
                ) : null}
              </div>

              {preview ? (
                <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-black text-slate-950">Preview — nothing has been written</h3>
                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {[
                      ["Invoices detected", preview.invoicesDetected],
                      ["Invoice lines", preview.linesDetected],
                      ["Customers matched", preview.customersMatched],
                      ["Customers unresolved", preview.customersUnresolved.length],
                      ["Product lines mapped", preview.productsMapped],
                      ["Items unresolved", preview.productsUnresolved.length],
                      ["Lines missing item code", preview.missingItemCodeLines],
                      ["Invoices eligible", preview.invoicesEligible],
                      ["Invoices blocked", preview.invoicesBlocked],
                      ["Will insert", preview.insertCount],
                      ["Will update", preview.updateCount],
                      ["Total sales", preview.totalSales.toFixed(2)],
                      ["Total VAT", preview.totalVat.toFixed(2)],
                      ["Total paid", preview.totalPaid.toFixed(2)],
                      ["Total outstanding", preview.totalOutstanding.toFixed(2)],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex justify-between gap-3">
                        <span className="font-semibold text-slate-500">{label}</span>
                        <span className="font-black text-slate-950">{value}</span>
                      </div>
                    ))}
                  </div>
                  {preview.productsUnresolved.length ? (
                    <div className="mt-4 max-h-40 overflow-y-auto rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                      <div className="font-black">Unresolved accounting items — map these first:</div>
                      {preview.productsUnresolved.map((code) => <div key={code}>{code}</div>)}
                    </div>
                  ) : null}
                  {preview.customersUnresolved.length ? (
                    <div className="mt-3 max-h-32 overflow-y-auto rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                      <div className="font-black">Unresolved customers:</div>
                      {preview.customersUnresolved.map((name) => <div key={name}>{name}</div>)}
                    </div>
                  ) : null}
                  {preview.errors.length ? (
                    <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-800">
                      {preview.errors.map((error) => <div key={error}>{error}</div>)}
                    </div>
                  ) : null}
                  {preview.warnings.length ? (
                    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                      {preview.warnings.map((warning) => <div key={warning}>{warning}</div>)}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {products.length ? (
                <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-black text-slate-950">Product Mapping</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Accounting item code to VYRON product. Saved per company and reused by every future import.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <input
                      value={mapCode}
                      onChange={(event) => setMapCode(event.target.value)}
                      placeholder="Accounting item code"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <select
                      value={mapProductId}
                      onChange={(event) => setMapProductId(event.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Select VYRON product…</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.product_name}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => void saveMapping()} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white">
                      Save Mapping
                    </button>
                  </div>
                  {mapMessage ? <p className="mt-3 text-xs font-bold text-violet-800">{mapMessage}</p> : null}
                  <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
                    {mappings.map((mapping) => (
                      <div key={mapping.id} className="flex justify-between rounded-xl border border-slate-100 px-3 py-2 text-xs">
                        <span className="font-black text-slate-950">{mapping.source_item_code || mapping.source_description}</span>
                        <span className="font-semibold text-slate-500">
                          {products.find((product) => product.id === mapping.product_id)?.product_name || mapping.product_id}
                        </span>
                      </div>
                    ))}
                    {!mappings.length ? <div className="text-xs font-semibold text-slate-400">No mappings yet.</div> : null}
                  </div>
                </div>
              ) : null}
      
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
