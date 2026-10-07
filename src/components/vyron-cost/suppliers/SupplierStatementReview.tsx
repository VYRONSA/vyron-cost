"use client";

import { useState } from "react";
import { Card, KpiCard, Notice, Pill, PrimaryButton, SecondaryButton, money } from "@/components/vyron-order-engine/ui";

/** The extracted statement as the API returns it (see src/lib/vyron-supplier-statement-pdf.ts). */
type Flag = { severity: "error" | "warning"; message: string };
type Field<T> = { value: T | null; source: string | null; page: number | null; flag: string | null };
type Transaction = {
  index: number;
  page: number;
  date: string | null;
  dateText: string | null;
  dueDate: string | null;
  reference: string | null;
  description: string | null;
  typeText: string | null;
  type: "INVOICE" | "CREDIT_NOTE" | "PAYMENT" | "OTHER" | "UNKNOWN";
  debit: number | null;
  credit: number | null;
  balance: number | null;
  status: "RECONCILE" | "NOT_RECONCILED" | "EXCLUDED";
  flags: Flag[];
  sourceText: string;
};
export type StatementExtraction = {
  pageCount: number;
  layout: "columns" | "rows" | "none";
  columns: string[];
  dateOrder: "day-first" | "month-first" | "unambiguous";
  supplier: Field<string> & { candidates: string[] };
  accountNumber: Field<string>;
  statementDate: Field<string>;
  periodFrom: Field<string>;
  periodTo: Field<string>;
  openingBalance: Field<number>;
  closingBalance: Field<number>;
  balanceCheck: { opening: number | null; movements: number; computedClosing: number | null; closing: number | null; agrees: boolean | null; difference: number | null };
  transactions: Transaction[];
  unreadLines: Array<{ page: number; text: string; reason: string }>;
  warnings: string[];
  counts: { transactions: number; toReconcile: number; notReconciled: number; excluded: number; withWarnings: number };
  digest: string;
};

const TYPE_LABEL: Record<Transaction["type"], string> = { INVOICE: "Invoice", CREDIT_NOTE: "Credit note", PAYMENT: "Payment", OTHER: "Other", UNKNOWN: "Unknown" };
const STATUS: Record<Transaction["status"], { label: string; tone: "green" | "slate" | "rose" }> = {
  RECONCILE: { label: "Will be reconciled", tone: "green" },
  NOT_RECONCILED: { label: "Read — not reconciled", tone: "slate" },
  EXCLUDED: { label: "Not read — excluded", tone: "rose" },
};
const amt = (v: number | null) => (v === null ? "—" : `R ${money(v)}`);

function FieldRow({ label, field, render }: { label: string; field: Field<string | number>; render?: (v: string | number) => string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</span>
      <span className={`text-sm font-black ${field.value === null ? "text-rose-700" : "text-slate-900"}`}>{field.value === null ? "Not found" : render ? render(field.value) : String(field.value)}</span>
      {field.flag ? <span className="text-xs font-semibold text-rose-700">{field.flag}</span> : field.source ? <span className="text-xs font-semibold text-slate-400">From: {field.source}</span> : null}
    </div>
  );
}

/** Review an extracted PDF statement. Nothing runs until the user approves it. */
export default function SupplierStatementReview({
  fileName,
  extraction,
  knownSuppliers,
  busy,
  onApprove,
  onCancel,
}: {
  fileName: string;
  extraction: StatementExtraction;
  knownSuppliers: string[];
  busy: boolean;
  onApprove: (supplierName: string) => void;
  onCancel: () => void;
}) {
  const e = extraction;
  const [supplier, setSupplier] = useState(e.supplier.value || "");
  const [reviewed, setReviewed] = useState(false);
  const [view, setView] = useState<"ALL" | "FLAGGED">("ALL");
  const known = knownSuppliers.some((s) => s.trim().toLowerCase() === supplier.trim().toLowerCase());
  const rows = e.transactions.filter((t) => view === "ALL" || t.flags.length > 0);
  const canApprove = reviewed && supplier.trim() !== "" && e.counts.toReconcile > 0 && !busy;

  return (
    <div className="grid gap-4">
      <Notice tone="info">
        Review the statement read from <b>{fileName}</b> ({e.pageCount} page{e.pageCount === 1 ? "" : "s"}). Nothing has been reconciled or saved. Check the lines against the PDF, then approve.
      </Notice>
      {e.warnings.map((w) => (
        <Notice key={w} tone="warning">
          {w}
        </Notice>
      ))}

      <Card title="Statement">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-1">
            <label className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500" htmlFor="statement-supplier">
              Supplier <span className="text-rose-600">*</span>
            </label>
            <input
              id="statement-supplier"
              list="statement-known-suppliers"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
              value={supplier}
              onChange={(ev) => setSupplier(ev.target.value)}
              placeholder="Choose or type the supplier"
            />
            <datalist id="statement-known-suppliers">
              {knownSuppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {e.supplier.flag ? <span className="text-xs font-semibold text-rose-700">{e.supplier.flag}</span> : e.supplier.source ? <span className="text-xs font-semibold text-slate-400">Read from: {e.supplier.source}</span> : null}
            {e.supplier.candidates.length > 1 ? (
              <div className="flex flex-wrap gap-1">
                {e.supplier.candidates.map((c) => (
                  <button key={c} type="button" onClick={() => setSupplier(c)} className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-semibold hover:bg-slate-50">
                    {c}
                  </button>
                ))}
              </div>
            ) : null}
            {supplier.trim() && !known ? <span className="text-xs font-semibold text-amber-700">No VOLORA supplier has exactly this name; invoices are matched by supplier name, so choose the VOLORA supplier if it is listed.</span> : null}
          </div>
          <FieldRow label="Statement date" field={e.statementDate} />
          <FieldRow label="Period from" field={e.periodFrom} />
          <FieldRow label="Period to" field={e.periodTo} />
          <FieldRow label="Account number" field={e.accountNumber} />
          <FieldRow label="Opening balance" field={e.openingBalance} render={(v) => amt(Number(v))} />
          <FieldRow label="Closing balance" field={e.closingBalance} render={(v) => amt(Number(v))} />
          <div className="grid gap-0.5">
            <span className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">Balance check</span>
            {e.balanceCheck.agrees === null ? (
              <span className="text-sm font-black text-slate-500">Cannot be checked</span>
            ) : e.balanceCheck.agrees ? (
              <span className="text-sm font-black text-emerald-700">Opening + lines = closing</span>
            ) : (
              <span className="text-sm font-black text-rose-700">Differs by {amt(e.balanceCheck.difference)}</span>
            )}
            <span className="text-xs font-semibold text-slate-400">
              Opening {amt(e.balanceCheck.opening)} + movements {amt(e.balanceCheck.movements)} = {amt(e.balanceCheck.computedClosing)}
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-400">
          Read as {e.layout === "columns" ? `columns (${e.columns.join(", ")})` : e.layout === "rows" ? "rows without column headings" : "—"}; dates {e.dateOrder === "month-first" ? "month/day" : e.dateOrder === "day-first" ? "day/month" : "unambiguous"}.
        </p>
      </Card>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Lines read" value={String(e.counts.transactions)} active={view === "ALL"} onClick={() => setView("ALL")} />
        <KpiCard label="To reconcile" value={String(e.counts.toReconcile)} />
        <KpiCard label="Payments / other" value={String(e.counts.notReconciled)} />
        <KpiCard label="Excluded" value={String(e.counts.excluded)} active={view === "FLAGGED"} onClick={() => setView("FLAGGED")} />
        <KpiCard label="Lines to check" value={String(e.counts.withWarnings)} active={view === "FLAGGED"} onClick={() => setView("FLAGGED")} />
      </section>

      <Card
        title="Extracted transactions"
        actions={<SecondaryButton onClick={() => setView(view === "ALL" ? "FLAGGED" : "ALL")}>{view === "ALL" ? "Flagged lines only" : "Show all lines"}</SecondaryButton>}
      >
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Page</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Reference</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3 text-right">Debit</th>
                <th className="py-2 pr-3 text-right">Credit</th>
                <th className="py-2 pr-3 text-right">Balance</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.index} className={`border-t border-slate-100 align-top font-semibold text-slate-700 ${t.status === "EXCLUDED" ? "bg-rose-50/60" : t.flags.length ? "bg-amber-50/60" : ""}`}>
                  <td className="py-2 pr-3 text-slate-400">{t.index}</td>
                  <td className="py-2 pr-3 text-slate-400">{t.page}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {t.date || <span className="text-rose-700">{t.dateText || "—"}</span>}
                    {t.dateText && t.date ? <span className="block text-xs text-slate-400">{t.dateText}</span> : null}
                  </td>
                  <td className="py-2 pr-3 font-black text-slate-900">{t.reference || <span className="text-rose-700">—</span>}</td>
                  <td className="py-2 pr-3">
                    {TYPE_LABEL[t.type]}
                    {t.typeText ? <span className="block text-xs text-slate-400">{t.typeText}</span> : null}
                  </td>
                  <td className="py-2 pr-3">
                    {t.description || "—"}
                    {t.flags.map((f) => (
                      <span key={f.message} className={`block text-xs font-semibold ${f.severity === "error" ? "text-rose-700" : "text-amber-700"}`}>
                        {f.message}
                      </span>
                    ))}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{t.debit ? amt(t.debit) : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{t.credit ? amt(t.credit) : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{amt(t.balance)}</td>
                  <td className="py-2 pr-3">
                    <Pill tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Pill>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-sm font-semibold text-slate-400">
                    {e.transactions.length ? "No flagged lines." : "No transaction lines were recognised in this statement."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {e.unreadLines.length ? (
        <Card title={`Lines not read (${e.unreadLines.length})`}>
          <p className="mb-2 text-xs font-semibold text-slate-500">These lines carry values but could not be interpreted as transactions. They are not reconciled — check them in the PDF.</p>
          <ul className="grid gap-1 text-sm">
            {e.unreadLines.map((u, i) => (
              <li key={i} className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2 font-semibold text-slate-700">
                <span className="text-xs text-slate-400">Page {u.page} · </span>
                {u.text}
                <span className="block text-xs text-rose-700">{u.reason}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Approve">
        <label className="flex items-start gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" className="mt-1" checked={reviewed} onChange={(ev) => setReviewed(ev.target.checked)} />
          <span>
            I have checked the extracted statement against the PDF. Reconcile the {e.counts.toReconcile} invoice / credit-note line(s) marked &ldquo;Will be reconciled&rdquo; for{" "}
            <b>{supplier.trim() || "the supplier"}</b>
            {e.counts.excluded ? `; the ${e.counts.excluded} excluded line(s) are left out` : ""}.
          </span>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <PrimaryButton disabled={!canApprove} onClick={() => onApprove(supplier.trim())}>
            {busy ? "Reconciling…" : "Approve and reconcile"}
          </PrimaryButton>
          <SecondaryButton disabled={busy} onClick={onCancel}>
            Discard
          </SecondaryButton>
        </div>
        {!e.counts.toReconcile ? <p className="mt-2 text-xs font-semibold text-rose-700">No invoice or credit-note line was read with confidence, so there is nothing to reconcile.</p> : null}
      </Card>
    </div>
  );
}
