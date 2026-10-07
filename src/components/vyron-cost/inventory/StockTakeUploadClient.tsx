"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, KpiCard, Notice, Pill, PrimaryButton, SecondaryButton, money, qty } from "@/components/vyron-order-engine/ui";
import FileDropZone from "@/components/vyron-ui/FileDropZone";
import { STOCK_TAKE_TEMPLATE_COLUMNS, STOCK_TAKE_TEMPLATE_EXAMPLE, stockTakeDateProblem, todayInSouthAfrica } from "@/lib/vyron-stock-take-rules";

type Line = {
  row: number;
  status: "MATCHED" | "NOT_COUNTED" | "UNMATCHED" | "AMBIGUOUS" | "DUPLICATE_IN_FILE" | "INVALID_QUANTITY" | "MISSING_IDENTIFIER" | "INVALID_ROW";
  sku: string | null;
  description: string | null;
  location: string | null;
  itemName: string | null;
  unit: string | null;
  systemQty: number | null;
  countedQty: number | null;
  varianceQty: number | null;
  unitCost: number | null;
  varianceValue: number | null;
  note: string;
};
type Summary = {
  rows: number;
  itemsCounted: number;
  itemsWithVariance: number;
  positiveAdjustments: number;
  negativeAdjustments: number;
  netQuantityVariance: number;
  positiveValueVariance: number;
  negativeValueVariance: number;
  netValueVariance: number;
  unmatched: number;
  notCounted: number;
  errors: number;
  stockTakeDate: string | null;
};

const STATUS: Record<Line["status"], { label: string; tone: "green" | "amber" | "rose" | "slate" }> = {
  MATCHED: { label: "Matched", tone: "green" },
  NOT_COUNTED: { label: "Not counted", tone: "slate" },
  UNMATCHED: { label: "Unmatched", tone: "rose" },
  AMBIGUOUS: { label: "Ambiguous", tone: "rose" },
  DUPLICATE_IN_FILE: { label: "Duplicate row", tone: "amber" },
  INVALID_QUANTITY: { label: "Invalid quantity", tone: "rose" },
  MISSING_IDENTIFIER: { label: "Missing item code", tone: "rose" },
  INVALID_ROW: { label: "Invalid row", tone: "rose" },
};

export default function StockTakeUploadClient() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ lines: Line[]; summary: Summary } | null>(null);
  const [created, setCreated] = useState<{ id: string; count_number: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyExceptions, setOnlyExceptions] = useState(false);
  const [stockTakeDate, setStockTakeDate] = useState("");
  const today = todayInSouthAfrica();
  const dateProblem = stockTakeDate ? stockTakeDateProblem(stockTakeDate, today) : null;
  const dateReady = Boolean(stockTakeDate) && !dateProblem;

  const send = async (chosen: File, action: "preview" | "create", date = stockTakeDate) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", chosen);
      form.append("action", action);
      form.append("countDate", date);
      const res = await fetch("/api/inventory/stock-take", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) {
        if (action === "preview") setPreview(null);
        throw new Error(data.error || "Stock take failed.");
      }
      setPreview({ lines: data.lines, summary: data.summary });
      if (action === "create") setCreated(data.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stock take failed.");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/stock-take/template");
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Template download failed.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "stock-take-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Template download failed.");
    } finally {
      setBusy(false);
    }
  };

  const s = preview?.summary;
  const lines = (preview?.lines || []).filter((l) => !onlyExceptions || (l.status !== "MATCHED" && l.status !== "NOT_COUNTED") || Math.abs(l.varianceQty || 0) >= 0.0001);

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Stock Take Upload</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
          Choose the Stock Take Date, download the template, fill in the counted quantities and drop the completed file here (Excel or CSV). VOLORA compares it with system stock as at
          close of business on the Stock Take Date. Nothing changes until you confirm it and a supervisor approves and posts the count; the adjustments are dated on the Stock Take Date.
        </p>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {created ? (
        <Notice tone="success">
          Stock count {created.count_number} created and awaiting approval.{" "}
          <Link className="font-black underline" href={`/inventory/counts/${created.id}`}>
            Open it to approve and post
          </Link>
          .
        </Notice>
      ) : null}

      <Card title="Upload">
        <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.13em] text-slate-500" htmlFor="stock-take-date">
              Stock Take Date <span className="text-rose-600">*</span>
            </label>
            <input
              id="stock-take-date"
              type="date"
              required
              max={today}
              value={stockTakeDate}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value;
                setStockTakeDate(next);
                setCreated(null);
                if (file && next && !stockTakeDateProblem(next, today)) void send(file, "preview", next);
                else setPreview(null);
              }}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            />
            <p className="mt-1 text-xs font-semibold text-slate-500">The day the physical count was performed — not the upload day.</p>
            {dateProblem ? <p className="mt-1 text-xs font-black text-rose-700">{dateProblem}</p> : null}
            <div className="mt-3">
              <SecondaryButton disabled={busy} onClick={() => void downloadTemplate()}>
                Download template
              </SecondaryButton>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">Required columns and an example row</p>
            <div className="mt-1 w-full overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    {STOCK_TAKE_TEMPLATE_COLUMNS.map((c) => (
                      <th key={c.header} className="py-1 pr-3 font-black">
                        {c.header}
                        {c.required ? <span className="text-rose-600"> *</span> : <span className="font-semibold"> (optional)</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100 font-semibold text-slate-700">
                    {STOCK_TAKE_TEMPLATE_COLUMNS.map((c) => (
                      <td key={c.header} className="py-1 pr-3">
                        {STOCK_TAKE_TEMPLATE_EXAMPLE[c.header]}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              The template lists your stock items by VOLORA item code. Enter 0 for an item with none on hand; leave the quantity blank for an item you did not count. Count each item once.
            </p>
          </div>
        </div>
        <FileDropZone
          disabled={busy || !dateReady}
          label={!dateReady ? "Choose the Stock Take Date first" : busy ? "Reading…" : file ? `${file.name} — drop another file to replace it` : "Drag & drop your stock take file here"}
          onFile={(f) => {
            setFile(f);
            setCreated(null);
            void send(f, "preview");
          }}
        />
      </Card>

      {preview && s ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <KpiCard label="Items counted" value={String(s.itemsCounted)} />
            <KpiCard label="With variance" value={String(s.itemsWithVariance)} />
            <KpiCard label="Positive adj." value={String(s.positiveAdjustments)} />
            <KpiCard label="Negative adj." value={String(s.negativeAdjustments)} />
            <KpiCard label="Net qty variance" value={qty(s.netQuantityVariance)} />
            <KpiCard label="Positive value" value={`R ${money(s.positiveValueVariance)}`} />
            <KpiCard label="Negative value" value={`R ${money(s.negativeValueVariance)}`} />
            <KpiCard label="Net value variance" value={`R ${money(s.netValueVariance)}`} />
          </section>
          {s.errors ? (
            <Notice tone="error">
              {s.errors} row(s) have errors (see the rows marked in red). Fix them in the file and upload it again — the stock take cannot proceed until every row is valid. Nothing has been recorded.
            </Notice>
          ) : (
            <Notice tone="success">
              The file is valid: {s.itemsCounted} item(s) counted as at {s.stockTakeDate}
              {s.notCounted ? `; ${s.notCounted} row(s) left blank are not counted and stay unchanged` : ""}.
            </Notice>
          )}
          <Card
            title="Stock take report"
            actions={
              <div className="flex gap-2">
                <SecondaryButton onClick={() => setOnlyExceptions(!onlyExceptions)}>{onlyExceptions ? "Show all rows" : "Variances & exceptions only"}</SecondaryButton>
                <PrimaryButton disabled={busy || !file || !dateReady || Boolean(created) || !s.itemsCounted || s.errors > 0} onClick={() => file && void send(file, "create")}>
                  Confirm — create count for approval
                </PrimaryButton>
              </div>
            }
          >
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Row</th>
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3 text-right">System at {s.stockTakeDate}</th>
                    <th className="py-2 pr-3 text-right">Counted</th>
                    <th className="py-2 pr-3 text-right">Variance</th>
                    <th className="py-2 pr-3 text-right">Unit cost</th>
                    <th className="py-2 pr-3 text-right">Variance value</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.row} className="border-t border-slate-100 align-top font-semibold text-slate-700">
                      <td className="py-2 pr-3 text-slate-400">{l.row}</td>
                      <td className="py-2 pr-3 font-black text-slate-900">
                        {l.itemName || l.description || "—"}
                        {l.note ? <span className="block text-xs font-semibold text-slate-500">{l.note}</span> : null}
                      </td>
                      <td className="py-2 pr-3">{l.sku || "—"}</td>
                      <td className="py-2 pr-3">{l.location || "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{l.systemQty === null ? "—" : `${qty(l.systemQty)} ${l.unit || ""}`}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{qty(l.countedQty)}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${(l.varianceQty || 0) < 0 ? "text-rose-700" : (l.varianceQty || 0) > 0 ? "text-emerald-700" : ""}`}>{qty(l.varianceQty)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{l.unitCost === null ? "—" : `R ${money(l.unitCost)}`}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{l.varianceValue === null ? "—" : `R ${money(l.varianceValue)}`}</td>
                      <td className="py-2 pr-3">
                        <Pill tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
