"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type OpeningStockRow = {
  productCode?: string;
  productName: string;
  warehouse: string;
  qty: number;
  cost: number;
  value?: number;
  batch?: string;
  bin?: string;
  date?: string;
  notes?: string;
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseCsv(text: string): OpeningStockRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => normalizeKey(h));
  const get = (cells: string[], key: string) => cells[headers.indexOf(key)] || "";
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    return {
      productCode: get(cells, "product_code") || undefined,
      productName: get(cells, "product_name"),
      warehouse: get(cells, "warehouse"),
      qty: Number(get(cells, "qty") || 0),
      cost: Number(get(cells, "cost") || 0),
      value: get(cells, "value") ? Number(get(cells, "value")) : undefined,
      batch: get(cells, "batch") || undefined,
      bin: get(cells, "bin") || undefined,
      date: get(cells, "date") || undefined,
      notes: get(cells, "notes") || undefined,
    };
  });
}

function parseXlsx(buffer: ArrayBuffer): OpeningStockRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return records.map((record) => {
    const map = new Map<string, string>();
    for (const [key, value] of Object.entries(record)) {
      map.set(normalizeKey(String(key)), String(value ?? "").trim());
    }
    return {
      productCode: map.get("product_code") || undefined,
      productName: map.get("product_name") || "",
      warehouse: map.get("warehouse") || "",
      qty: Number(map.get("qty") || 0),
      cost: Number(map.get("cost") || 0),
      value: map.get("value") ? Number(map.get("value")) : undefined,
      batch: map.get("batch") || undefined,
      bin: map.get("bin") || undefined,
      date: map.get("date") || undefined,
      notes: map.get("notes") || undefined,
    };
  });
}

export default function OpeningStockImportClient() {
  const [rows, setRows] = useState<OpeningStockRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const invalidCount = useMemo(() => {
    return rows.filter((row) => !row.productName || !row.warehouse || Number(row.qty) <= 0 || Number(row.cost) < 0).length;
  }, [rows]);

  async function upload(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    setError("");
    setMessage("");

    try {
      const lower = file.name.toLowerCase();
      const parsed = lower.endsWith(".xlsx") || lower.endsWith(".xls")
        ? parseXlsx(await file.arrayBuffer())
        : parseCsv(await file.text());
      setRows(parsed);
      setMessage(`Loaded ${parsed.length} row(s).`);
    } catch {
      setRows([]);
      setError("Unable to parse upload file.");
    }
  }

  function downloadTemplate() {
    const header = ["product_code", "product_name", "warehouse", "qty", "cost", "value", "batch", "bin", "date", "notes"];
    const sample = ["P-100", "Chicken Pie 500g", "Main Warehouse", "250", "18.45", "4612.50", "B240701", "A-03", "2026-07-01", "Initial enterprise load"];
    const csv = `${header.join(",")}\n${sample.join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vyron-opening-stock-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importRows() {
    if (!rows.length) {
      setError("Upload data first.");
      return;
    }
    if (invalidCount > 0) {
      setError(`There are ${invalidCount} invalid row(s).`);
      return;
    }

    setBusy(true);
    setError("");
    setMessage("Importing...");

    try {
      const res = await fetch("/api/inventory/opening-stock/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: fileName || "opening-stock-import.csv",
          rows,
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
        <h2 className="text-base font-bold text-slate-900">Opening Stock Import Wizard</h2>
        <p className="mt-1 text-sm text-slate-600">Import Product, Warehouse, Qty, Cost, Value, Batch, Bin, Date, and Notes with rollback and ledger posting.</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={downloadTemplate} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900">Download Template</button>
          <label className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            Upload CSV/XLSX
            <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={(e) => void upload(e.target.files?.[0] || null)} />
          </label>
          <button type="button" disabled={busy} onClick={() => void importRows()} className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Import</button>
        </div>

        {fileName ? <div className="mt-2 text-xs font-semibold text-slate-500">File: {fileName}</div> : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-900">Preview</h3>
        <div className="mt-2 text-xs text-slate-600">Rows loaded: {rows.length} · Invalid: {invalidCount}</div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2">Warehouse</th>
                <th className="px-2 py-2">Qty</th>
                <th className="px-2 py-2">Cost</th>
                <th className="px-2 py-2">Value</th>
                <th className="px-2 py-2">Batch</th>
                <th className="px-2 py-2">Bin</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((row, idx) => (
                <tr key={`${row.productCode || row.productName}-${idx}`} className="border-t border-slate-100">
                  <td className="px-2 py-2">{row.productCode || row.productName}</td>
                  <td className="px-2 py-2">{row.warehouse}</td>
                  <td className="px-2 py-2">{row.qty}</td>
                  <td className="px-2 py-2">{row.cost}</td>
                  <td className="px-2 py-2">{row.value ?? ""}</td>
                  <td className="px-2 py-2">{row.batch || ""}</td>
                  <td className="px-2 py-2">{row.bin || ""}</td>
                  <td className="px-2 py-2">{row.date || ""}</td>
                  <td className="px-2 py-2">{row.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
