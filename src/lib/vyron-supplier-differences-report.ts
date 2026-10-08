import type { DifferenceCategory, DocumentDifference, StatementMatchResult, SupplierDocumentType, VoloraRecord } from "@/lib/vyron-supplier-statement-match";

/**
 * VOLORA — Supplier Statement Reconciliation: Differences Report (pure).
 *
 * Answers one question: which invoices, credit notes and debit notes on the supplier statement do not
 * agree with what VOLORA holds, and exactly what differs. Built only from a reconciliation result —
 * the live match preview or a saved run's stored result — never by matching again or asking the AI.
 * Payments, receipts (including _CR unapplied cash) and balance lines are not supplier documents and
 * never appear. Reading it writes nothing.
 */

export type DifferencesReportData = {
  supplierName: string;
  fileName: string | null;
  statementDate: string | null;
  /** The period printed on the statement; falls back to the document date range. */
  periodFrom: string | null;
  periodTo: string | null;
  accountNumber: string | null;
  /** When this report was produced. */
  generatedAt: string;
  /** "preview": matched but not yet approved/recorded; "saved": a recorded reconciliation run. */
  basis: "preview" | "saved";
  savedAt: string | null;
  summary: StatementMatchResult["summary"];
  differences: DocumentDifference[];
};

export type ReportSection = {
  category: DifferenceCategory;
  title: string;
  description: string;
  columns: string[];
  /** Index of numeric columns (right-aligned). */
  numeric: number[];
  rows: Array<{ key: string; cells: string[] }>;
};

const DOCUMENT_TYPES: readonly SupplierDocumentType[] = ["invoice", "credit_note", "debit_note"];
const TYPE_LABEL: Record<SupplierDocumentType, string> = { invoice: "Invoice", credit_note: "Credit note", debit_note: "Debit note" };

/** Only supplier documents belong on the report — a defensive filter on top of the matcher's own exclusion. */
export function reportableDifferences(differences: DocumentDifference[]): DocumentDifference[] {
  return differences.filter((d) => DOCUMENT_TYPES.includes(d.documentType));
}

export function reportMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${n < 0 ? "-" : ""}R ${Math.abs(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function reportDays(days: number | null | undefined): string {
  if (days === null || days === undefined) return "—";
  return `${days > 0 ? "+" : ""}${days} day${Math.abs(days) === 1 ? "" : "s"}`;
}

const text = (v: string | null | undefined) => (v ? v : "—");
const refs = (d: DocumentDifference) => [...(d.references ?? []), ...(d.voloraInvoiceNumber && d.voloraInvoiceNumber !== d.documentNumber ? [`VOLORA ${d.voloraInvoiceNumber}`] : [])].join(", ") || "—";
const source = (origin: string) => (origin === "document" ? "Invoice Intelligence" : origin === "register" ? "Supplier invoice register" : origin);
export function voloraRecordLine(r: VoloraRecord, i: number): string {
  return `${i + 1}. ${text(r.invoiceNumber)} · dated ${text(r.invoiceDate)} · ${reportMoney(r.total)} · ${source(r.origin)} · id ${r.id.slice(0, 8)}`;
}
const records = (d: DocumentDifference) => ((d.voloraCandidates ?? []).length ? (d.voloraCandidates ?? []).map(voloraRecordLine).join("\n") : "None found");
const why = (d: DocumentDifference) => [d.note, ...(d.reviewReasons ?? [])].filter(Boolean).join(" ");

/** The report's sections, in reading order; a section appears only when it has rows. */
export function reportSections(differences: DocumentDifference[]): ReportSection[] {
  const rows = reportableDifferences(differences);
  const of = (c: DifferenceCategory) => rows.filter((d) => d.category === c);
  const key = (d: DocumentDifference, i: number) => `${d.category}-${d.row ?? "v"}-${d.voloraId ?? i}`;
  const sections: ReportSection[] = [
    {
      category: "AMOUNT_DIFFERENCE",
      title: "Amount differences",
      description: "Identified in VOLORA by document number; the amounts do not agree.",
      columns: ["Document no.", "Type", "Statement date", "VOLORA date", "Statement amount", "VOLORA amount", "Difference", "Reference(s)", "Result"],
      numeric: [4, 5, 6],
      rows: of("AMOUNT_DIFFERENCE").map((d, i) => ({
        key: key(d, i),
        cells: [text(d.documentNumber), TYPE_LABEL[d.documentType], text(d.statementDate), text(d.voloraDate), reportMoney(d.statementAmount), reportMoney(d.voloraAmount), reportMoney(d.amountDifference), refs(d), `Amount difference${d.dateDifferenceDays ? ` (date also differs ${reportDays(d.dateDifferenceDays)})` : ""}`],
      })),
    },
    {
      category: "DATE_DIFFERENCE",
      title: "Date differences",
      description: "Identified in VOLORA by document number; the amounts agree but the dates do not. The document is not missing.",
      columns: ["Document no.", "Type", "Statement date", "VOLORA date", "Days difference", "Statement amount", "VOLORA amount", "Result"],
      numeric: [4, 5, 6],
      rows: of("DATE_DIFFERENCE").map((d, i) => ({
        key: key(d, i),
        cells: [text(d.documentNumber), TYPE_LABEL[d.documentType], text(d.statementDate), text(d.voloraDate), reportDays(d.dateDifferenceDays), reportMoney(d.statementAmount), reportMoney(d.voloraAmount), "Date difference"],
      })),
    },
    {
      category: "NOTE_DIFFERENCE",
      title: "Credit / debit note differences",
      description: "Credit and debit notes identified in VOLORA by document number whose amounts do not agree.",
      columns: ["Document no.", "Note type", "Statement date", "VOLORA date", "Statement amount", "VOLORA amount", "Difference", "Result"],
      numeric: [4, 5, 6],
      rows: of("NOTE_DIFFERENCE").map((d, i) => ({
        key: key(d, i),
        cells: [text(d.documentNumber), TYPE_LABEL[d.documentType], text(d.statementDate), text(d.voloraDate), reportMoney(d.statementAmount), reportMoney(d.voloraAmount), reportMoney(d.amountDifference), `${TYPE_LABEL[d.documentType]} difference`],
      })),
    },
    {
      category: "DUPLICATE",
      title: "Duplicates on the statement",
      description: "The same document number appears more than once on the statement. No VOLORA record was selected automatically.",
      columns: ["Document no.", "Type", "Statement row", "Statement date", "Statement amount", "VOLORA records with this number", "Result"],
      numeric: [4],
      rows: of("DUPLICATE").map((d, i) => ({
        key: key(d, i),
        cells: [text(d.documentNumber), TYPE_LABEL[d.documentType], d.row === null ? "—" : String(d.row), text(d.statementDate), reportMoney(d.statementAmount), records(d), "Duplicate — no VOLORA record was selected automatically"],
      })),
    },
    {
      category: "MISSING_IN_VOLORA",
      title: "Missing in VOLORA",
      description: "On the supplier statement, but no VOLORA document carries this number.",
      columns: ["Document no.", "Type", "Statement date", "Statement amount", "Statement reference(s)", "Result"],
      numeric: [3],
      rows: of("MISSING_IN_VOLORA").map((d, i) => ({
        key: key(d, i),
        cells: [text(d.documentNumber), TYPE_LABEL[d.documentType], text(d.statementDate), reportMoney(d.statementAmount), (d.references ?? []).join(", ") || "—", "Not found in VOLORA"],
      })),
    },
    {
      category: "NEEDS_REVIEW",
      title: "Needs review",
      description: "VOLORA could not decide on its own. Nothing was selected automatically.",
      columns: ["Document no.", "Type", "Statement date", "Statement amount", "VOLORA records found", "Reason", "Evidence"],
      numeric: [3],
      rows: of("NEEDS_REVIEW").map((d, i) => ({
        key: key(d, i),
        cells: [text(d.documentNumber), TYPE_LABEL[d.documentType], text(d.statementDate), reportMoney(d.statementAmount), records(d), why(d), [refs(d) !== "—" ? `References: ${refs(d)}` : null, d.evidence].filter(Boolean).join(" · ") || "—"],
      })),
    },
    {
      category: "NOT_ON_STATEMENT",
      title: "In VOLORA, not on the statement",
      description: "VOLORA documents for this supplier, dated within the statement's document period, that the statement does not show.",
      columns: ["Document no.", "Type", "VOLORA date", "VOLORA amount", "Reference(s)", "Result"],
      numeric: [3],
      rows: of("NOT_ON_STATEMENT").map((d, i) => ({
        key: key(d, i),
        cells: [text(d.documentNumber), TYPE_LABEL[d.documentType], text(d.voloraDate), reportMoney(d.voloraAmount), (d.references ?? []).join(", ") || "—", "Not on the supplier statement"],
      })),
    },
  ];
  return sections.filter((s) => s.rows.length > 0);
}

/** The summary band, straight from the reconciliation result. */
export function reportSummary(summary: StatementMatchResult["summary"], differences: DocumentDifference[]): Array<{ label: string; value: string }> {
  const total = reportableDifferences(differences).length;
  return [
    { label: "Supplier documents reviewed", value: String(summary.documents) },
    { label: "Matched", value: String(summary.matched) },
    { label: "Amount differences", value: String(summary.amountDifferences) },
    { label: "Date differences", value: String(summary.dateDifferences) },
    { label: "Duplicates", value: String(summary.duplicates) },
    { label: "Missing in VOLORA", value: String(summary.missing) },
    { label: "Credit/debit note differences", value: String(summary.noteDifferences) },
    { label: "Needs review", value: String(summary.needsReview) },
    { label: "In VOLORA, not on statement", value: String(summary.notOnStatement) },
    { label: "Total differences", value: String(total) },
  ];
}

/** Case-insensitive search over what a row shows (number, references, dates, amounts, reasons). */
export function matchesSearch(d: DocumentDifference, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [d.documentNumber, d.voloraInvoiceNumber, ...(d.references ?? []), d.statementDate, d.voloraDate, d.note, d.evidence, String(d.statementAmount ?? ""), String(d.voloraAmount ?? "")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}
