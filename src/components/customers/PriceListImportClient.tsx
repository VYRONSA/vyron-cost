"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type ParsedRow = {
  listName: string;
  listType?: "Standard" | "Contract";
  customerCode?: string;
  customerName?: string;
  productCode: string;
  productName: string;
  basePrice?: number;
  markupPct?: number;
  discountPct?: number;
  gpPct?: number;
  overridePrice?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  status?: "Active" | "Inactive";
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function toRowsFromWorkbook(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows.map((row) => {
    const map = new Map<string, string>();
    for (const [key, value] of Object.entries(row)) {
      map.set(normalizeKey(String(key)), String(value ?? "").trim());
    }
    return {
      listName: map.get("list_name") || "",
      listType: (map.get("list_type") || "Standard") as "Standard" | "Contract",
      customerCode: map.get("customer_code") || "",
      customerName: map.get("customer_name") || "",
      productCode: map.get("product_code") || "",
      productName: map.get("product_name") || "",
      basePrice: Number(map.get("base_price") || 0),
      markupPct: Number(map.get("markup_pct") || 0),
      discountPct: Number(map.get("discount_pct") || 0),
      gpPct: Number(map.get("gp_pct") || 0),
      overridePrice: map.get("override_price") ? Number(map.get("override_price")) : undefined,
      effectiveFrom: map.get("effective_from") || "",
      effectiveTo: map.get("effective_to") || "",
      status: (map.get("status") || "Active") as "Active" | "Inactive",
    };
  });
}

function toRowsFromCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => normalizeKey(h));
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const get = (name: string) => cells[headers.indexOf(name)] || "";
    return {
      listName: get("list_name"),
      listType: (get("list_type") || "Standard") as "Standard" | "Contract",
      customerCode: get("customer_code"),
      customerName: get("customer_name"),
      productCode: get("product_code"),
      productName: get("product_name"),
      basePrice: Number(get("base_price") || 0),
      markupPct: Number(get("markup_pct") || 0),
      discountPct: Number(get("discount_pct") || 0),
      gpPct: Number(get("gp_pct") || 0),
      overridePrice: get("override_price") ? Number(get("override_price")) : undefined,
      effectiveFrom: get("effective_from"),
      effectiveTo: get("effective_to"),
      status: (get("status") || "Active") as "Active" | "Inactive",
    };
  });
}

export default function PriceListImportClient() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createMissingProducts, setCreateMissingProducts] = useState(false);

  const invalid = useMemo(() => {
    return rows.filter((row) => !row.listName || (!row.productCode && !row.productName));
  }, [rows]);

  async function onUpload(file: File | null) {
    if (!file) return;
    setMessage("");
    setError("");
    setFileName(file.name);

    const lower = file.name.toLowerCase();
    try {
      const parsed = lower.endsWith(".xlsx") || lower.endsWith(".xls")
        ? toRowsFromWorkbook(await file.arrayBuffer())
        : toRowsFromCsv(await file.text());
      setRows(parsed);
      setMessage(`Loaded ${parsed.length} row(s).`);
    } catch {
      setRows([]);
      setError("Unable to parse file.");
    }
  }

  function downloadTemplate() {
    const header = [
      "list_name",
      "list_type",
      "customer_code",
      "customer_name",
      "product_code",
      "product_name",
      "base_price",
      "markup_pct",
      "discount_pct",
      "gp_pct",
      "override_price",
      "effective_from",
      "effective_to",
      "status",
    ];
    const sample = [
      "Retail Standard",
      "Standard",
      "CUST-001",
      "Acme Trading",
      "P-100",
      "Chicken Pie 500g",
      "49.90",
      "5",
      "0",
      "35",
      "",
      "2026-07-01",
      "",
      "Active",
    ];
    const csv = `${header.join(",")}\n${sample.join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vyron-price-list-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runImport() {
    if (!rows.length) {
      setError("Upload a file first.");
      return;
    }
    if (invalid.length) {
      setError(`Fix ${invalid.length} invalid row(s) before importing.`);
      return;
    }

    setBusy(true);
    setError("");
    setMessage("Importing...");

    try {
      const res = await fetch("/api/customer-price-lists/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: fileName || "price-list-import.csv",
          rows,
          createMissingProducts,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Import failed.");
      setMessage(`Imported ${data.imported} row(s) · Rejected ${data.rejected} row(s).`);
      if (Array.isArray(data.errors) && data.errors.length) {
        setError(data.errors.slice(0, 8).map((e: { row: number; error: string }) => `Row ${e.row}: ${e.error}`).join(" | "));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-800">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold text-slate-900">Price List Import Wizard</h2>
        <p className="mt-1 text-sm text-slate-600">CSV/XLSX upload with validation, duplicate detection, rollback-safe import, and audit capture.</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={downloadTemplate} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900">Download Template</button>
          <label className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            Upload CSV/XLSX
            <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={(e) => void onUpload(e.target.files?.[0] || null)} />
          </label>
          <button type="button" disabled={busy} onClick={() => void runImport()} className="rounded-lg vyron-grad-surface px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Import</button>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={createMissingProducts} onChange={(e) => setCreateMissingProducts(e.target.checked)} />
          Create missing products when not found
        </label>

        {fileName ? <div className="mt-2 text-xs font-semibold text-slate-500">File: {fileName}</div> : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-900">Preview</h3>
        <div className="mt-2 text-xs text-slate-600">Rows loaded: {rows.length} · Invalid: {invalid.length}</div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">List</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2">Base</th>
                <th className="px-2 py-2">Markup%</th>
                <th className="px-2 py-2">Discount%</th>
                <th className="px-2 py-2">GP%</th>
                <th className="px-2 py-2">Override</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((row, idx) => (
                <tr key={`${row.listName}-${row.productCode}-${idx}`} className="border-t border-slate-100">
                  <td className="px-2 py-2">{row.listName}</td>
                  <td className="px-2 py-2">{row.listType || "Standard"}</td>
                  <td className="px-2 py-2">{row.customerCode || row.customerName || "-"}</td>
                  <td className="px-2 py-2">{row.productCode || row.productName}</td>
                  <td className="px-2 py-2">{row.basePrice ?? 0}</td>
                  <td className="px-2 py-2">{row.markupPct ?? 0}</td>
                  <td className="px-2 py-2">{row.discountPct ?? 0}</td>
                  <td className="px-2 py-2">{row.gpPct ?? 0}</td>
                  <td className="px-2 py-2">{row.overridePrice ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
