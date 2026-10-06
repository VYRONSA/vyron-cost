"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, KpiCard, Notice, Pill, PrimaryButton, SecondaryButton, money, qty } from "@/components/vyron-order-engine/ui";
import FileDropZone from "@/components/vyron-ui/FileDropZone";

type Line = {
  row: number;
  status: "MATCHED" | "MATCHED_BY_NAME" | "UNMATCHED" | "AMBIGUOUS" | "DUPLICATE_IN_FILE" | "INVALID_QUANTITY";
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
};

const STATUS: Record<Line["status"], { label: string; tone: "green" | "amber" | "rose" | "slate" }> = {
  MATCHED: { label: "Matched", tone: "green" },
  MATCHED_BY_NAME: { label: "Matched by name", tone: "amber" },
  UNMATCHED: { label: "Unmatched", tone: "rose" },
  AMBIGUOUS: { label: "Ambiguous", tone: "rose" },
  DUPLICATE_IN_FILE: { label: "Duplicate row", tone: "amber" },
  INVALID_QUANTITY: { label: "Invalid quantity", tone: "rose" },
};

export default function StockTakeUploadClient() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ lines: Line[]; summary: Summary } | null>(null);
  const [created, setCreated] = useState<{ id: string; count_number: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyExceptions, setOnlyExceptions] = useState(false);

  const send = async (chosen: File, action: "preview" | "create") => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", chosen);
      form.append("action", action);
      const res = await fetch("/api/inventory/stock-take", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Stock take failed.");
      setPreview({ lines: data.lines, summary: data.summary });
      if (action === "create") setCreated(data.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stock take failed.");
    } finally {
      setBusy(false);
    }
  };

  const s = preview?.summary;
  const lines = (preview?.lines || []).filter((l) => !onlyExceptions || l.status !== "MATCHED" || Math.abs(l.varianceQty || 0) >= 0.0001);

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Stock Take Upload</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
          Drop your counted stock (CSV or Excel with a SKU / item code and a counted quantity). VOLORA compares it with system stock. Nothing changes until you confirm it and a supervisor
          approves and posts the count.
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
        <FileDropZone
          disabled={busy}
          label={busy ? "Reading…" : file ? `${file.name} — drop another file to replace it` : "Drag & drop your stock take file here"}
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
          {s.unmatched ? <Notice tone="warning">{s.unmatched} row(s) could not be matched to a stock item and will not be counted. No product is created.</Notice> : null}
          <Card
            title="Stock take report"
            actions={
              <div className="flex gap-2">
                <SecondaryButton onClick={() => setOnlyExceptions(!onlyExceptions)}>{onlyExceptions ? "Show all rows" : "Variances & exceptions only"}</SecondaryButton>
                <PrimaryButton disabled={busy || !file || Boolean(created) || !s.itemsCounted} onClick={() => file && void send(file, "create")}>
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
                    <th className="py-2 pr-3 text-right">System</th>
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
