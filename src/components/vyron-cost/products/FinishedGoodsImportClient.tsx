"use client";

import { useState } from "react";
import FileDropZone from "@/components/vyron-ui/FileDropZone";
import { Card, Notice, Pill, PrimaryButton, SecondaryButton } from "@/components/vyron-order-engine/ui";
import { downloadCsv } from "@/lib/vyron-csv-download";

type Status = "NEW" | "UPDATE" | "UNCHANGED" | "ERROR";
type Row = {
  row: number;
  itemCode: string;
  description: string;
  category: string;
  unit: string;
  priceText: string;
  statusText: string;
  changes: { field: string; from: string; to: string }[];
  status: Status;
  errors: string[];
  warnings: string[];
};
type Preview = { rows: Row[]; summary: Record<Status, number> & { total: number }; canApply: boolean };

const TONE: Record<Status, "green" | "blue" | "slate" | "rose"> = { NEW: "green", UPDATE: "blue", UNCHANGED: "slate", ERROR: "rose" };
const LABEL: Record<Status, string> = { NEW: "Unknown → new", UPDATE: "Update", UNCHANGED: "Unchanged", ERROR: "Error" };

export default function FinishedGoodsImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);

  const send = async (action: "preview" | "apply", chosen: File) => {
    const form = new FormData();
    form.set("file", chosen);
    form.set("action", action);
    form.set("createNew", String(createNew));
    return (await fetch("/api/products/import", { method: "POST", body: form })).json();
  };

  const choose = async (chosen: File) => {
    setFile(chosen);
    setPreview(null);
    setMessage(null);
    setBusy(true);
    try {
      const data = await send("preview", chosen);
      if (!data.ok) throw new Error(data.error || "The file could not be checked.");
      setPreview(data);
      setOnlyProblems(data.summary.ERROR > 0);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "The file could not be checked." });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!file || !preview?.canApply) return;
    if (createNew && preview.summary.NEW && !window.confirm(`Create ${preview.summary.NEW} new finished good product(s) in the product master?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await send("apply", file);
      if (!data.ok) throw new Error(data.error || "Import failed.");
      const failed = (data.failed || []) as { row: number; itemCode: string; error: string }[];
      const text = `${data.updated} updated, ${data.created} created${data.notCreated ? `, ${data.notCreated} unknown product(s) not created` : ""}.`;
      setMessage(failed.length ? { tone: "warning", text: `${text} ${failed.length} failed: ${failed.map((f) => `row ${f.row} ${f.itemCode}: ${f.error}`).join("; ")}` } : { tone: "success", text });
      setPreview(null);
      setFile(null);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Import failed." });
    } finally {
      setBusy(false);
    }
  };

  const report = () => {
    if (!preview) return;
    downloadCsv(
      `finished-goods-import-correction-report-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Row", "Item Code", "Product Description", "Category", "Unit of Measure", "Selling Price (excl. VAT)", "Status", "Result", "Errors", "Warnings", "Changes"],
      preview.rows.map((r) => [
        r.row,
        r.itemCode,
        r.description,
        r.category,
        r.unit,
        r.priceText,
        r.statusText,
        LABEL[r.status],
        r.errors.join(" | "),
        r.warnings.join(" | "),
        r.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join(" | "),
      ])
    );
  };

  const shown = (preview?.rows || []).filter((r) => !onlyProblems || r.status === "ERROR" || r.status === "NEW");
  const applyCount = preview ? preview.summary.UPDATE + (createNew ? preview.summary.NEW : 0) : 0;

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Finished Goods Import</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
          Update finished goods in the product master by Item Code — description, category, selling price and status — and, only if you choose, create products for unknown Item
          Codes. Cost and stock quantities are never imported here. Nothing is saved until you review the preview; a file with any error is not imported.
        </p>
      </div>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Card
        title="Upload"
        actions={
          <a className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50" href="/api/products/import?format=xlsx" download data-testid="fg-import-template">
            Download Excel template
          </a>
        }
      >
        <p className="mb-3 text-xs font-semibold text-slate-500">Columns: Item Code, Product Description, Category, Unit of Measure, Selling Price (excl. VAT), Status.</p>
        <FileDropZone label="Drag & drop the Finished Goods file here" hint="or click to browse files (Excel .xlsx or CSV, max 5 MB)" disabled={busy} onFile={(f) => void choose(f)} />
        {busy ? <p className="mt-3 text-sm font-semibold text-slate-500">Working…</p> : null}
      </Card>

      {preview ? (
        <Card title={`Preview — ${file?.name || ""}`}>
          <div className="grid gap-3" data-testid="fg-import-preview">
            <div className="flex flex-wrap gap-2 text-xs font-black">
              {(["UPDATE", "NEW", "UNCHANGED", "ERROR"] as Status[]).map((s) => (
                <Pill key={s} tone={TONE[s]}>
                  {LABEL[s]} {preview.summary[s]}
                </Pill>
              ))}
            </div>
            {preview.summary.ERROR > 0 ? <Notice tone="error">{preview.summary.ERROR} row(s) have errors. Download the correction report, fix the file and upload it again.</Notice> : null}
            {preview.summary.NEW > 0 && preview.summary.ERROR === 0 ? (
              <label className="flex items-center gap-2 text-sm font-black text-slate-700">
                <input type="checkbox" checked={createNew} onChange={(e) => setCreateNew(e.target.checked)} />
                Create {preview.summary.NEW} new product(s) for the unknown Item Codes
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <PrimaryButton disabled={busy || !preview.canApply || applyCount === 0} onClick={() => void apply()}>
                Import {applyCount} row(s)
              </PrimaryButton>
              <SecondaryButton onClick={report}>Download correction report</SecondaryButton>
              <label className="flex items-center gap-2 text-xs font-black text-slate-600">
                <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Errors and unknown products only
              </label>
            </div>
            <div className="max-h-[520px] w-full overflow-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="sticky top-0 bg-white text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Row</th>
                    <th className="py-2 pr-3">Item Code</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">Result</th>
                    <th className="py-2 pr-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.row} className="border-t border-slate-100 align-top font-semibold text-slate-700">
                      <td className="py-1.5 pr-3 text-slate-400">{r.row}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{r.itemCode || "—"}</td>
                      <td className="py-1.5 pr-3">{r.description || "—"}</td>
                      <td className="py-1.5 pr-3">
                        <Pill tone={TONE[r.status]}>{LABEL[r.status]}</Pill>
                      </td>
                      <td className="py-1.5 pr-3 text-xs">
                        {r.errors.map((e) => (
                          <div key={e} className="text-rose-700">{e}</div>
                        ))}
                        {r.warnings.map((w) => (
                          <div key={w} className="text-amber-700">{w}</div>
                        ))}
                        {r.changes.map((c) => (
                          <div key={c.field} className="text-slate-600">
                            {c.field}: <s>{c.from}</s> → <b>{c.to}</b>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                  {!shown.length ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-sm text-slate-400">No rows to show.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
