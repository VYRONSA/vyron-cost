"use client";

import { useState } from "react";
import FileDropZone from "@/components/vyron-ui/FileDropZone";
import { Card, Notice, Pill, PrimaryButton, SecondaryButton, qty } from "@/components/vyron-order-engine/ui";
import { downloadCsv } from "@/lib/vyron-csv-download";

type Kind = "finished_goods" | "raw_materials";
type Status = "NEW" | "CHANGE" | "UNCHANGED" | "SKIPPED" | "ERROR";
type Row = {
  row: number;
  itemCode: string;
  description: string;
  unit: string;
  minimumText: string;
  minimum: number | null;
  currentMinimum: number | null;
  status: Status;
  errors: string[];
  warnings: string[];
};
type Preview = { rows: Row[]; summary: Record<Status, number> & { total: number; warnings: number }; canApply: boolean };

const LABEL: Record<Kind, string> = { finished_goods: "Finished Goods", raw_materials: "Raw Materials" };
const TONE: Record<Status, "green" | "blue" | "slate" | "amber" | "rose"> = { NEW: "green", CHANGE: "blue", UNCHANGED: "slate", SKIPPED: "amber", ERROR: "rose" };
const STATUS_LABEL: Record<Status, string> = { NEW: "New", CHANGE: "Change", UNCHANGED: "Unchanged", SKIPPED: "Skipped", ERROR: "Error" };

/** Template download, drag-and-drop / browse upload, preview, error report and apply for one section. */
export default function MinimumLevelsUpload({ kind, onApplied }: { kind: Kind; onApplied: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const send = async (action: "preview" | "apply", chosen: File) => {
    const form = new FormData();
    form.set("file", chosen);
    form.set("kind", kind);
    form.set("action", action);
    const res = await fetch("/api/inventory/minimum-levels/import", { method: "POST", body: form });
    return res.json();
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
    setBusy(true);
    setMessage(null);
    try {
      const data = await send("apply", file);
      if (!data.ok) throw new Error(data.error || "Apply failed.");
      const failed = (data.failed || []) as { row: number; itemCode: string; error: string }[];
      setMessage(
        failed.length
          ? { tone: "warning", text: `${data.applied} minimum level(s) saved; ${failed.length} failed: ${failed.map((f) => `row ${f.row} ${f.itemCode}: ${f.error}`).join("; ")}` }
          : { tone: "success", text: `${data.applied} minimum level(s) saved from ${file.name}.` }
      );
      setPreview(null);
      setFile(null);
      onApplied();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Apply failed." });
    } finally {
      setBusy(false);
    }
  };

  const report = () => {
    if (!preview) return;
    downloadCsv(
      `minimum-levels-${kind}-check-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Row", "Item Code", "Product Description", "Unit of Measure", "Minimum Stock Level", "Current Minimum", "Status", "Errors", "Warnings"],
      preview.rows.map((r) => [r.row, r.itemCode, r.description, r.unit, r.minimumText, r.currentMinimum ?? "", STATUS_LABEL[r.status], r.errors.join(" | "), r.warnings.join(" | ")])
    );
  };

  const shown = (preview?.rows || []).filter((r) => !onlyProblems || r.status === "ERROR" || (r.warnings.length > 0 && r.status !== "SKIPPED"));

  return (
    <Card
      title={`Upload ${LABEL[kind]} minimum levels`}
      actions={
        <a className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50" href={`/api/inventory/minimum-levels/import?kind=${kind}`} data-testid={`min-template-${kind}`}>
          Download Excel template
        </a>
      }
    >
      <p className="mb-3 text-xs font-semibold text-slate-500">
        Columns: Item Code, Product Description, Unit of Measure, Minimum Stock Level. The template lists your active {LABEL[kind].toLowerCase()} with their current minimum. Nothing is saved until
        you review the preview and apply it; a file with any error is not applied.
      </p>
      <FileDropZone label="Drag & drop the completed template here" hint="or click to browse files (Excel .xlsx or CSV, max 5 MB)" disabled={busy} onFile={(f) => void choose(f)} />
      {busy ? <p className="mt-3 text-sm font-semibold text-slate-500">Working…</p> : null}
      {message ? (
        <div className="mt-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      ) : null}
      {preview ? (
        <div className="mt-4 grid gap-3" data-testid={`min-preview-${kind}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs font-black">
            <span className="text-slate-700">{file?.name}</span>
            {(["NEW", "CHANGE", "UNCHANGED", "SKIPPED", "ERROR"] as Status[]).map((s) => (
              <Pill key={s} tone={TONE[s]}>
                {STATUS_LABEL[s]} {preview.summary[s]}
              </Pill>
            ))}
            {preview.summary.warnings ? <Pill tone="amber">Warnings {preview.summary.warnings}</Pill> : null}
          </div>
          {preview.summary.ERROR > 0 ? (
            <Notice tone="error">{preview.summary.ERROR} row(s) have errors. Correct the file (download the error report) and upload it again — nothing will be applied until every row is valid.</Notice>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <PrimaryButton disabled={busy || !preview.canApply} onClick={() => void apply()}>
              Apply {preview.summary.NEW + preview.summary.CHANGE} minimum level(s)
            </PrimaryButton>
            <SecondaryButton onClick={report}>Download error report</SecondaryButton>
            <label className="flex items-center gap-2 text-xs font-black text-slate-600">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Errors and warnings only
            </label>
          </div>
          <div className="max-h-[420px] w-full overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 bg-white text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">Item Code</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3 text-right">Current</th>
                  <th className="py-2 pr-3 text-right">New minimum</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.row} className="border-t border-slate-100 align-top font-semibold text-slate-700">
                    <td className="py-1.5 pr-3 text-slate-400">{r.row}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">{r.itemCode || "—"}</td>
                    <td className="py-1.5 pr-3">{r.description}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{qty(r.currentMinimum)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{r.minimum === null ? r.minimumText || "—" : qty(r.minimum)}</td>
                    <td className="py-1.5 pr-3">
                      <Pill tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                    </td>
                    <td className="py-1.5 pr-3 text-xs">
                      {r.errors.map((e) => (
                        <div key={e} className="text-rose-700">{e}</div>
                      ))}
                      {r.warnings.map((w) => (
                        <div key={w} className="text-amber-700">{w}</div>
                      ))}
                    </td>
                  </tr>
                ))}
                {!shown.length ? (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-sm text-slate-400">No rows to show.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
