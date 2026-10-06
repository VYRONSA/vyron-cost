"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, KpiCard, Notice, Pill, money } from "@/components/vyron-order-engine/ui";
import FileDropZone from "@/components/vyron-ui/FileDropZone";

type Status = "MATCHED" | "MISSING_IN_VOLORA" | "TOTAL_DIFFERENCE" | "VAT_DIFFERENCE" | "DUPLICATE" | "CREDIT_NOTE" | "NOT_ON_SUPPLIER_DOCUMENT";
type Line = {
  id?: string;
  status: Status;
  supplier_name: string | null;
  invoice_number: string | null;
  document_type: string;
  supplier_date: string | null;
  supplier_total: number | null;
  volora_total: number | null;
  difference: number | null;
  vat_difference: number | null;
  volora_ref: string | null;
  notes: string | null;
};
type Summary = {
  supplierInvoices: number;
  matched: number;
  missing: number;
  totalDifferences: number;
  vatDifferences: number;
  duplicates: number;
  creditNotes: number;
  notOnSupplierDocument: number;
  supplierValue: number;
  voloraValue: number;
  difference: number;
  periodFrom: string | null;
  periodTo: string | null;
  skippedRows?: Array<{ row: number; reason: string }>;
};
type Run = { id: string; supplier_name: string | null; source_file_name: string; created_at: string; summary: Summary };

const STATUS: Record<Status, { label: string; tone: "green" | "amber" | "rose" | "blue" | "slate" }> = {
  MATCHED: { label: "Matched", tone: "green" },
  MISSING_IN_VOLORA: { label: "Missing in VOLORA", tone: "rose" },
  TOTAL_DIFFERENCE: { label: "Total difference", tone: "amber" },
  VAT_DIFFERENCE: { label: "VAT difference", tone: "amber" },
  DUPLICATE: { label: "Duplicate", tone: "rose" },
  CREDIT_NOTE: { label: "Credit note", tone: "blue" },
  NOT_ON_SUPPLIER_DOCUMENT: { label: "Not on supplier document", tone: "slate" },
};

const toLine = (l: Record<string, unknown>): Line =>
  "status" in l && "supplier_name" in l
    ? (l as unknown as Line)
    : ({
        status: l.status,
        supplier_name: l.supplierName,
        invoice_number: l.invoiceNumber,
        document_type: l.documentType,
        supplier_date: l.supplierDate,
        supplier_total: l.supplierTotal,
        volora_total: l.voloraTotal,
        difference: l.difference,
        vat_difference: l.vatDifference,
        volora_ref: l.voloraRef,
        notes: l.notes,
      } as Line);

export default function SupplierReconciliationClient() {
  const [supplierName, setSupplierName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<{ id: string; fileName: string; summary: Summary; lines: Line[] } | null>(null);
  const [filter, setFilter] = useState<Status | "EXCEPTIONS" | "ALL">("EXCEPTIONS");
  const [history, setHistory] = useState<Run[]>([]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/supplier-reconciliations", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setHistory(data.reconciliations);
  }, []);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (supplierName.trim()) form.append("supplierName", supplierName.trim());
      const res = await fetch("/api/supplier-reconciliations", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Reconciliation failed.");
      setCurrent({ id: data.reconciliation.id, fileName: file.name, summary: { ...data.summary, skippedRows: data.skipped }, lines: data.lines.map(toLine) });
      setFilter("EXCEPTIONS");
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconciliation failed.");
    } finally {
      setBusy(false);
    }
  };

  const open = async (run: Run) => {
    const res = await fetch(`/api/supplier-reconciliations/${run.id}`, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setCurrent({ id: run.id, fileName: run.source_file_name, summary: run.summary, lines: data.lines.map(toLine) });
  };

  const s = current?.summary;
  const lines = (current?.lines || []).filter((l) => (filter === "ALL" ? true : filter === "EXCEPTIONS" ? l.status !== "MATCHED" : l.status === filter));

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Supplier Invoice Reconciliation</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
          Upload a supplier statement or invoice list. VOLORA matches each line by supplier and invoice number against the supplier invoices it holds and shows every exception. Nothing is
          posted to your books.
        </p>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Card title="Upload">
        <div className="grid gap-3">
          <label className="grid max-w-md gap-1 text-xs font-black uppercase text-slate-500">
            Supplier (only needed when the file has no supplier column)
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold normal-case" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. N1 Restaurant Suppliers (Pty) Ltd" />
          </label>
          <FileDropZone disabled={busy} label={busy ? "Reconciling…" : "Drag & drop a supplier statement or invoice list (CSV / Excel)"} onFile={(f) => void upload(f)} />
        </div>
      </Card>

      {current && s ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <KpiCard label="Supplier invoices" value={String(s.supplierInvoices)} active={filter === "ALL"} onClick={() => setFilter("ALL")} />
            <KpiCard label="Matched" value={String(s.matched)} active={filter === "MATCHED"} onClick={() => setFilter("MATCHED")} />
            <KpiCard label="Missing" value={String(s.missing)} active={filter === "MISSING_IN_VOLORA"} onClick={() => setFilter("MISSING_IN_VOLORA")} />
            <KpiCard label="Differences" value={String(s.totalDifferences + s.vatDifferences)} active={filter === "TOTAL_DIFFERENCE"} onClick={() => setFilter("TOTAL_DIFFERENCE")} />
            <KpiCard label="Duplicates" value={String(s.duplicates)} active={filter === "DUPLICATE"} onClick={() => setFilter("DUPLICATE")} />
            <KpiCard label="Credit notes" value={String(s.creditNotes)} active={filter === "CREDIT_NOTE"} onClick={() => setFilter("CREDIT_NOTE")} />
            <KpiCard label="Not on supplier doc" value={String(s.notOnSupplierDocument)} active={filter === "NOT_ON_SUPPLIER_DOCUMENT"} onClick={() => setFilter("NOT_ON_SUPPLIER_DOCUMENT")} />
            <KpiCard label="Exceptions" value={String(current.lines.filter((l) => l.status !== "MATCHED").length)} active={filter === "EXCEPTIONS"} onClick={() => setFilter("EXCEPTIONS")} />
          </section>
          <Card
            title={`Reconciliation — ${current.fileName}${s.periodFrom ? ` (${s.periodFrom} → ${s.periodTo})` : ""}`}
            actions={
              <a className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200" href={`/api/supplier-reconciliations/${current.id}?format=csv`}>
                Export CSV
              </a>
            }
          >
            <div className="mb-3 flex flex-wrap gap-6 text-sm font-semibold text-slate-600">
              <span>
                Supplier value <b className="text-slate-900">R {money(s.supplierValue)}</b>
              </span>
              <span>
                VOLORA value <b className="text-slate-900">R {money(s.voloraValue)}</b>
              </span>
              <span>
                Difference <b className={Math.abs(s.difference) > 0.01 ? "text-rose-700" : "text-emerald-700"}>R {money(s.difference)}</b>
              </span>
            </div>
            {s.skippedRows?.length ? <Notice tone="warning">{s.skippedRows.length} row(s) without an invoice number or a readable amount were not reconciled (e.g. balance rows): rows {s.skippedRows.map((r) => r.row).join(", ")}.</Notice> : null}
            <div className="mt-3 w-full overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Supplier</th>
                    <th className="py-2 pr-3">Invoice number</th>
                    <th className="py-2 pr-3">Supplier date</th>
                    <th className="py-2 pr-3 text-right">Supplier total</th>
                    <th className="py-2 pr-3 text-right">VOLORA total</th>
                    <th className="py-2 pr-3 text-right">Difference</th>
                    <th className="py-2 pr-3 text-right">VAT difference</th>
                    <th className="py-2 pr-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.id || i} className="border-t border-slate-100 font-semibold text-slate-700">
                      <td className="py-2 pr-3">
                        <Pill tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Pill>
                      </td>
                      <td className="py-2 pr-3">{l.supplier_name || "—"}</td>
                      <td className="py-2 pr-3 font-black text-slate-900">{l.invoice_number || "—"}</td>
                      <td className="py-2 pr-3">{l.supplier_date || "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{l.supplier_total === null ? "—" : `R ${money(l.supplier_total)}`}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{l.volora_total === null ? "Not found" : `R ${money(l.volora_total)}`}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{l.difference === null ? "—" : `R ${money(l.difference)}`}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{l.vat_difference === null ? "—" : `R ${money(l.vat_difference)}`}</td>
                      <td className="py-2 pr-3 text-slate-500">
                        {l.notes}
                        {l.volora_ref ? <span className="block text-xs">{l.volora_ref}</span> : null}
                      </td>
                    </tr>
                  ))}
                  {!lines.length ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-sm font-semibold text-slate-400">
                        Nothing in this view.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      <Card title="Previous reconciliations">
        {!history.length ? <p className="text-sm font-semibold text-slate-400">None yet.</p> : null}
        <ul className="grid gap-2">
          {history.map((run) => (
            <li key={run.id}>
              <button type="button" onClick={() => void open(run)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3 text-left text-sm font-semibold hover:bg-slate-50">
                <span className="font-black text-slate-900">
                  {run.supplier_name || "Supplier"} · {run.source_file_name}
                </span>
                <span className="text-slate-500">
                  {new Date(run.created_at).toLocaleString("en-ZA")} · {run.summary?.matched ?? 0} matched · {(run.summary?.missing ?? 0) + (run.summary?.totalDifferences ?? 0) + (run.summary?.vatDifferences ?? 0) + (run.summary?.duplicates ?? 0)} exceptions
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
