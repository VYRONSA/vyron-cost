"use client";

import { useState } from "react";
import { Card, KpiCard, Notice, Pill, PrimaryButton, SecondaryButton, money } from "@/components/vyron-order-engine/ui";
import type { InterpretedLine, StatementInterpretation } from "@/lib/vyron-supplier-statement-ai";
import type { LineMatch, StatementMatchResult } from "@/lib/vyron-supplier-statement-match";
import type { DifferencesReportData } from "@/lib/vyron-supplier-differences-report";

// The reconciliation population (mirrors SUPPLIER_DOCUMENT_TYPES; the match module is server-only).
const isSupplierDocument = (l: InterpretedLine) => l.type === "invoice" || l.type === "credit_note" || l.type === "debit_note";

const AI_TYPE_LABEL: Record<InterpretedLine["type"], string> = {
  invoice: "Invoice",
  credit_note: "Credit note",
  debit_note: "Debit note",
  payment: "Payment",
  unallocated_receipt: "Unallocated receipt",
  journal: "Journal",
  adjustment: "Adjustment",
  interest: "Interest",
  discount: "Discount",
  balance_line: "Balance line",
  unknown: "Unknown",
};
const MATCH_LABEL: Record<LineMatch["status"], { label: string; tone: "green" | "amber" | "rose" | "blue" | "slate" }> = {
  MATCHED: { label: "Matched", tone: "green" },
  AMOUNT_DIFFERENCE: { label: "Amount difference", tone: "rose" },
  DATE_DIFFERENCE: { label: "Date difference", tone: "amber" },
  NOTE_DIFFERENCE: { label: "Credit / debit note difference", tone: "rose" },
  MISSING_IN_VOLORA: { label: "Missing in VOLORA", tone: "rose" },
  DUPLICATE: { label: "Duplicate on statement", tone: "rose" },
  NEEDS_REVIEW: { label: "Needs review", tone: "amber" },
  NOT_RECONCILED: { label: "—", tone: "slate" },
};
const METHOD_LABEL: Record<NonNullable<LineMatch["method"]>, string> = { document_number: "by document number", reference: "by reference", amount_date: "by amount + date — confirm" };

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
  interpretation,
  onMatch,
  onOpenReport,
}: {
  fileName: string;
  extraction: StatementExtraction;
  knownSuppliers: string[];
  busy: boolean;
  onApprove: (supplierName: string) => void;
  onCancel: () => void;
  /** The statement AI's interpretation (SUPPLIER_STATEMENT_AI=on); absent → the reader's view below. */
  interpretation?: StatementInterpretation | null;
  /** Deterministic match preview for the confirmed supplier (writes nothing). */
  onMatch?: (supplierName: string) => Promise<StatementMatchResult>;
  /** Open the Differences Report for the current match preview (display only). */
  onOpenReport?: (data: DifferencesReportData) => void;
}) {
  const e = extraction;
  const [supplier, setSupplier] = useState(e.supplier.value || "");
  const [reviewed, setReviewed] = useState(false);
  const [view, setView] = useState<"ALL" | "FLAGGED">("ALL");
  const [match, setMatch] = useState<{ supplier: string; result: StatementMatchResult } | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const known = knownSuppliers.some((s) => s.trim().toLowerCase() === supplier.trim().toLowerCase());
  const rows = e.transactions.filter((t) => view === "ALL" || t.flags.length > 0);
  const ip = interpretation || null;
  const currentMatch = match && match.supplier === supplier.trim() ? match.result : null;
  const matchByIndex = new Map((currentMatch?.lines || []).map((m) => [m.index, m]));
  const reconcilable = ip ? ip.lines.filter(isSupplierDocument).length : 0;
  const canApprove = ip ? reviewed && supplier.trim() !== "" && Boolean(currentMatch) && reconcilable > 0 && !busy : reviewed && supplier.trim() !== "" && e.counts.toReconcile > 0 && !busy;
  const runMatch = async (name: string) => {
    if (!onMatch || !name.trim()) return;
    setMatching(true);
    setMatchError(null);
    try {
      setMatch({ supplier: name.trim(), result: await onMatch(name.trim()) });
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : "Matching failed.");
    } finally {
      setMatching(false);
    }
  };

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
            {ip?.metadata.supplierName.value && ip.metadata.supplierName.value !== supplier.trim() ? (
              <span className="text-xs font-semibold text-slate-500">
                Suggested from the statement: <b>{ip.metadata.supplierName.value}</b>{" "}
                <button type="button" className="font-black underline" onClick={() => setSupplier(ip.metadata.supplierName.value || "")}>
                  Use
                </button>
              </span>
            ) : null}
            {ip && (ip.metadata.supplierEmail.value || ip.metadata.supplierVatNumber.value || ip.metadata.supplierWebsite.value) ? (
              <span className="text-xs font-semibold text-slate-400">
                {[ip.metadata.supplierEmail.value, ip.metadata.supplierWebsite.value, ip.metadata.supplierVatNumber.value ? `VAT ${ip.metadata.supplierVatNumber.value}` : null].filter(Boolean).join(" · ")}
              </span>
            ) : null}
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

      {ip ? (
        <InterpretedView
          ip={ip}
          matchByIndex={matchByIndex}
          currentMatch={currentMatch}
          matching={matching}
          matchError={matchError}
          canMatch={Boolean(onMatch) && supplier.trim() !== "" && !busy}
          onMatchClick={() => void runMatch(supplier)}
          onViewReport={
            onOpenReport && currentMatch
              ? () =>
                  onOpenReport({
                    supplierName: currentMatch.supplierName,
                    fileName,
                    statementDate: e.statementDate.value ?? ip.metadata.statementDate.value,
                    // The period printed on the statement; otherwise the range of its document dates.
                    periodFrom: e.periodFrom.value ?? currentMatch.summary.periodFrom,
                    periodTo: e.periodTo.value ?? currentMatch.summary.periodTo,
                    accountNumber: e.accountNumber.value ?? ip.metadata.supplierAccountNumber.value,
                    generatedAt: new Date().toISOString(),
                    basis: "preview",
                    savedAt: null,
                    summary: currentMatch.summary,
                    differences: currentMatch.differences,
                  })
              : undefined
          }
        />
      ) : null}

      {ip ? null : (
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Lines read" value={String(e.counts.transactions)} active={view === "ALL"} onClick={() => setView("ALL")} />
        <KpiCard label="To reconcile" value={String(e.counts.toReconcile)} />
        <KpiCard label="Payments / other" value={String(e.counts.notReconciled)} />
        <KpiCard label="Excluded" value={String(e.counts.excluded)} active={view === "FLAGGED"} onClick={() => setView("FLAGGED")} />
        <KpiCard label="Lines to check" value={String(e.counts.withWarnings)} active={view === "FLAGGED"} onClick={() => setView("FLAGGED")} />
      </section>
      )}

      {ip ? null : (
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
      )}

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
          {ip ? (
            <span>
              I have checked the interpreted statement against the PDF. Reconcile its {reconcilable} supplier document(s) — invoices, credit notes and debit notes — as matched above for <b>{supplier.trim() || "the supplier"}</b>, with every
              difference recorded. Payments and receipts are not supplier documents and are not reconciled; documents marked Needs Review are recorded as such.
              {!currentMatch ? <span className="block text-xs font-semibold text-amber-700">Run &ldquo;Match against VOLORA&rdquo; for this supplier first.</span> : null}
            </span>
          ) : (
            <span>
              I have checked the extracted statement against the PDF. Reconcile the {e.counts.toReconcile} invoice / credit-note line(s) marked &ldquo;Will be reconciled&rdquo; for{" "}
              <b>{supplier.trim() || "the supplier"}</b>
              {e.counts.excluded ? `; the ${e.counts.excluded} excluded line(s) are left out` : ""}.
            </span>
          )}
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <PrimaryButton disabled={!canApprove} onClick={() => onApprove(supplier.trim())}>
            {busy ? "Reconciling…" : "Approve and reconcile"}
          </PrimaryButton>
          <SecondaryButton disabled={busy} onClick={onCancel}>
            Discard
          </SecondaryButton>
        </div>
        {!ip && !e.counts.toReconcile ? <p className="mt-2 text-xs font-semibold text-rose-700">No invoice or credit-note line was read with confidence, so there is nothing to reconcile.</p> : null}
      </Card>
    </div>
  );
}

type DocumentFilter = "ALL" | "DIFFERENCES" | Exclude<LineMatch["status"], "NOT_RECONCILED">;

const signedDays = (d: number | null) => (d === null ? "—" : `${d > 0 ? "+" : ""}${d} day${Math.abs(d) === 1 ? "" : "s"}`);

/**
 * The interpreted statement as a supplier-document reconciliation: only invoices, credit notes and
 * debit notes, matched against VOLORA, with every disagreement listed. Payments, receipts and other
 * rows are not supplier documents — they are counted as excluded and never shown as exceptions.
 */
function InterpretedView({
  ip,
  matchByIndex,
  currentMatch,
  matching,
  matchError,
  canMatch,
  onMatchClick,
  onViewReport,
}: {
  ip: StatementInterpretation;
  matchByIndex: Map<number, LineMatch>;
  currentMatch: StatementMatchResult | null;
  matching: boolean;
  matchError: string | null;
  canMatch: boolean;
  onMatchClick: () => void;
  onViewReport?: () => void;
}) {
  const [filter, setFilter] = useState<DocumentFilter>("ALL");
  const documents = ip.lines.filter(isSupplierDocument);
  const excluded = ip.lines.length - documents.length;
  // Rows read as something other than a supplier document that may be one: the one way a missed invoice or credit note can hide.
  const possibleDocuments = ip.lines.filter((l) => !isSupplierDocument(l) && l.needsReview);
  const s = currentMatch?.summary;
  const statusOf = (l: InterpretedLine) => matchByIndex.get(l.index)?.status;
  const needsReview = (l: InterpretedLine) => l.needsReview || statusOf(l) === "NEEDS_REVIEW";
  const shown = documents.filter((l) => {
    if (filter === "ALL") return true;
    const st = statusOf(l);
    if (filter === "DIFFERENCES") return (st && st !== "MATCHED") || l.needsReview;
    if (filter === "NEEDS_REVIEW") return needsReview(l);
    return st === filter;
  });
  const tile = (label: string, value: number | undefined, f: DocumentFilter) => <KpiCard label={label} value={s ? String(value ?? 0) : "—"} active={filter === f} onClick={() => setFilter(filter === f ? "ALL" : f)} />;
  return (
    <>
      {ip.aiStatus !== "ok" ? <Notice tone="warning">{ip.aiMessage || "The AI interpretation is not available; the reader's own reading is shown and every supplier document needs review."}</Notice> : null}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Supplier documents" value={String(documents.length)} active={filter === "ALL"} onClick={() => setFilter("ALL")} />
        {tile("Matched", s?.matched, "MATCHED")}
        {tile("Amount difference", s?.amountDifferences, "AMOUNT_DIFFERENCE")}
        {tile("Date difference", s?.dateDifferences, "DATE_DIFFERENCE")}
        {tile("Duplicate", s?.duplicates, "DUPLICATE")}
        {tile("Missing in VOLORA", s?.missing, "MISSING_IN_VOLORA")}
        {tile("Credit / debit note difference", s?.noteDifferences, "NOTE_DIFFERENCE")}
        <KpiCard label="Needs review" value={String(s ? s.needsReview + documents.filter((l) => l.needsReview && statusOf(l) !== "NEEDS_REVIEW").length : documents.filter((l) => l.needsReview).length)} active={filter === "NEEDS_REVIEW"} onClick={() => setFilter(filter === "NEEDS_REVIEW" ? "ALL" : "NEEDS_REVIEW")} />
      </section>
      <p className="-mt-2 text-xs font-semibold text-slate-500">
        {ip.counts.invoice} invoice(s) · {ip.counts.credit_note} credit note(s) · {ip.counts.debit_note} debit note(s). {excluded} other statement row(s) — payments, receipts / unapplied cash and balance lines — are not supplier documents and are excluded from
        matching, counts and differences.
      </p>
      {possibleDocuments.length ? (
        <Notice tone="warning">
          {possibleDocuments.length} row(s) were not read as a supplier document but may be one — check them in the PDF:{" "}
          {possibleDocuments.map((l) => `row ${l.index} (${[l.date, l.debit ? `debit ${amt(l.debit)}` : l.credit ? `credit ${amt(l.credit)}` : null, AI_TYPE_LABEL[l.type].toLowerCase()].filter(Boolean).join(", ")})`).join("; ")}.
        </Notice>
      ) : null}

      <Card
        title="Supplier Documents — Reconciled"
        actions={
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => setFilter(filter === "DIFFERENCES" ? "ALL" : "DIFFERENCES")}>{filter === "DIFFERENCES" ? "Show all documents" : "Differences only"}</SecondaryButton>
            {currentMatch && onViewReport ? <SecondaryButton onClick={onViewReport}>View Differences Report</SecondaryButton> : null}
            <PrimaryButton disabled={!canMatch || matching} onClick={onMatchClick}>
              {matching ? "Matching…" : currentMatch ? "Match again" : "Match against VOLORA"}
            </PrimaryButton>
          </div>
        }
      >
        {matchError ? <Notice tone="error">{matchError}</Notice> : null}
        {s ? (
          <p className="mb-2 text-xs font-semibold text-slate-500">
            Identified {s.matchedByDocumentNumber} by document number · {s.matchedByReference} by reference · {s.matchedByAmountDate} by amount + date. A document identified by its number stays identified when its date or amount differs in VOLORA — the
            difference is shown against it. Matching writes nothing.
          </p>
        ) : (
          <p className="mb-2 text-xs font-semibold text-slate-500">Confirm the supplier above, then match the statement&apos;s supplier documents against the invoices VOLORA holds. Matching writes nothing.</p>
        )}
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Document no.</th>
                <th className="py-2 pr-3">Statement date</th>
                <th className="py-2 pr-3">VOLORA date</th>
                <th className="py-2 pr-3">Date diff.</th>
                <th className="py-2 pr-3 text-right">Statement amount</th>
                <th className="py-2 pr-3 text-right">VOLORA amount</th>
                <th className="py-2 pr-3 text-right">Difference</th>
                <th className="py-2 pr-3">Result</th>
                <th className="py-2 pr-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => {
                const m = matchByIndex.get(l.index);
                const review = needsReview(l);
                const amount = l.type === "credit_note" ? (l.credit !== null ? -l.credit : null) : l.debit;
                const dateDiffers = Boolean(m?.dateDifferenceDays);
                const amountDiffers = m?.difference !== null && m?.difference !== undefined && Math.abs(m.difference) > 0.01;
                return (
                  <tr key={l.index} className={`border-t border-slate-100 align-top font-semibold text-slate-700 ${review ? "bg-amber-50/60" : m && m.status !== "MATCHED" ? "bg-rose-50/40" : ""}`}>
                    <td className="py-2 pr-3 text-slate-400">{l.index}</td>
                    <td className="py-2 pr-3">
                      {AI_TYPE_LABEL[l.type]}
                      {l.typeSource === "reader" ? <span className="block text-xs text-slate-400">reader&apos;s reading</span> : null}
                    </td>
                    <td className="py-2 pr-3 font-black text-slate-900">
                      {l.documentNumber || "—"}
                      {l.secondaryReferences.length ? <span className="block text-xs font-semibold text-slate-400">{l.secondaryReferences.join(", ")}</span> : null}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{l.date || "—"}</td>
                    <td className={`py-2 pr-3 whitespace-nowrap ${dateDiffers ? "text-rose-700" : ""}`}>{m?.voloraDate || "—"}</td>
                    <td className={`py-2 pr-3 whitespace-nowrap ${dateDiffers ? "font-black text-rose-700" : "text-slate-400"}`}>{m && m.voloraDate ? signedDays(m.dateDifferenceDays) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{amount !== null ? amt(amount) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{m && m.voloraTotal !== null ? amt(m.voloraTotal) : "—"}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${amountDiffers ? "font-black text-rose-700" : "text-slate-400"}`}>{m && m.difference !== null ? amt(m.difference) : "—"}</td>
                    <td className="py-2 pr-3">
                      {m ? (
                        <>
                          <Pill tone={MATCH_LABEL[m.status].tone}>{MATCH_LABEL[m.status].label}</Pill>
                          {m.method ? <span className="block text-xs text-slate-400">{METHOD_LABEL[m.method]}</span> : null}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">not checked</span>
                      )}
                      {l.needsReview && m?.status !== "NEEDS_REVIEW" ? (
                        <span className="mt-1 block">
                          <Pill tone="amber">Needs review</Pill>
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {m?.note ? <span className="block text-slate-600">{m.note}</span> : null}
                      {l.descriptionMeaning ? <span className="block text-slate-400">{l.descriptionMeaning}</span> : null}
                      {l.structurallyConfirmed ? <span className="block text-emerald-700">confirmed by the statement layout</span> : null}
                      {l.reviewReasons.map((r) => (
                        <span key={r} className="block font-semibold text-amber-700">
                          {r}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
              {!shown.length ? (
                <tr>
                  <td colSpan={11} className="py-6 text-center text-sm font-semibold text-slate-400">
                    {documents.length ? "No supplier documents in this view." : "No invoices, credit notes or debit notes were read from this statement."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {currentMatch && onViewReport ? <DifferencesReportCallout count={currentMatch.differences.length} onView={onViewReport} /> : null}
    </>
  );
}

/** The way into the Differences Report from a reconciliation (the report itself is SupplierDifferencesReport). */
export function DifferencesReportCallout({ count, onView }: { count: number; onView: () => void }) {
  return (
    <Card
      title="Differences Report"
      actions={
        <PrimaryButton onClick={onView}>
          View Differences Report
        </PrimaryButton>
      }
    >
      <p className="text-sm font-semibold text-slate-600">
        {count ? `${count} supplier document difference(s) between the statement and VOLORA, grouped by type, ready to view and print.` : "Every supplier document on the statement agrees with VOLORA."} Payments and receipts are not part of the report. Viewing or printing it
        changes nothing.
      </p>
    </Card>
  );
}

/** The supplier-document summary of a saved statement reconciliation. */
export function SupplierDocumentTiles({ summary }: { summary: StatementMatchResult["summary"] }) {
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <KpiCard label="Supplier documents" value={String(summary.documents)} />
      <KpiCard label="Matched" value={String(summary.matched)} />
      <KpiCard label="Amount difference" value={String(summary.amountDifferences)} />
      <KpiCard label="Date difference" value={String(summary.dateDifferences)} />
      <KpiCard label="Duplicate" value={String(summary.duplicates)} />
      <KpiCard label="Missing in VOLORA" value={String(summary.missing)} />
      <KpiCard label="Credit / debit note difference" value={String(summary.noteDifferences)} />
      <KpiCard label="Needs review" value={String(summary.needsReview)} />
    </section>
  );
}
