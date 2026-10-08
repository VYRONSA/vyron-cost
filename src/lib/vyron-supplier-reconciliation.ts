import type { SupabaseClient } from "@supabase/supabase-js";
import { normalisedNameKey } from "@/lib/vyron-supplier-resolution";
import { listSupplierInvoiceRegister, type SupplierInvoiceRegisterRow } from "@/lib/vyron-supplier-invoices";
import { parseAmount, parseDateCell, pickColumn } from "@/lib/vyron-upload-table";
import type { CsvTable } from "@/lib/data-migration/csv";
import { extractSupplierStatementPdf, type StatementExtraction } from "@/lib/vyron-supplier-statement-pdf";
import {
  AMOUNT_DATE_WINDOW_DAYS,
  isSupplierDocument,
  matchInterpretedStatement,
  verifyReviewedInterpretation,
  type MatchCandidate,
  type StatementMatchStatus,
  type StatementMatchResult,
} from "@/lib/vyron-supplier-statement-match";

/**
 * VOLORA — supplier invoice reconciliation.
 *
 * A supplier statement / invoice list is compared with the supplier invoices VOLORA holds (the
 * register: imported invoices and invoices approved in Invoice Intelligence). Matching is on
 * supplier + invoice number — never on amount alone. It is a control: nothing is posted, created
 * or changed in the books; the run itself is kept as a record.
 */

/** NEEDS_REVIEW is produced only by the interpreted PDF statement path (more than one candidate, or conflicting evidence). */
export type ReconStatus = "MATCHED" | "MISSING_IN_VOLORA" | "TOTAL_DIFFERENCE" | "VAT_DIFFERENCE" | "DUPLICATE" | "CREDIT_NOTE" | "NOT_ON_SUPPLIER_DOCUMENT" | "NEEDS_REVIEW";

export type StatementLine = {
  row: number;
  supplierName: string;
  invoiceNumber: string;
  documentType: "INVOICE" | "CREDIT_NOTE";
  invoiceDate: string | null;
  dueDate: string | null;
  total: number | null;
  vat: number | null;
  amountPaid: number | null;
};

export type ReconLine = {
  status: ReconStatus;
  supplierName: string | null;
  invoiceNumber: string | null;
  documentType: "INVOICE" | "CREDIT_NOTE";
  supplierDate: string | null;
  dueDate: string | null;
  supplierTotal: number | null;
  supplierVat: number | null;
  amountPaid: number | null;
  voloraTotal: number | null;
  voloraVat: number | null;
  difference: number | null;
  vatDifference: number | null;
  voloraRef: string | null;
  sourceRow: number | null;
  notes: string;
};

export type ReconSummary = {
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
  /** Interpreted PDF statements only. */
  needsReview?: number;
  /** Interpreted PDF statements only: documents matched on their number whose date differs in VOLORA (stored as MATCHED lines). */
  dateDifferences?: number;
};

export class ReconciliationError extends Error {}

/** Cents tolerance: totals agree when within one cent. */
export const RECON_TOLERANCE = 0.01;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Invoice-number key: case, spaces and separators ignored ("INV-001236" = "inv 001236"). Leading zeros are kept. */
export function invoiceNumberKey(value: string | null | undefined): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const COLUMNS = {
  supplier: ["supplier", "supplier name", "creditor", "vendor", "account name"],
  number: ["invoice number", "invoice no", "invoice", "inv no", "inv number", "document number", "document no", "doc no", "reference", "ref", "number"],
  date: ["invoice date", "date", "document date", "doc date", "transaction date"],
  due: ["due date", "due", "payment due"],
  total: ["invoice total", "total", "amount", "total incl", "total incl vat", "gross", "debit", "value"],
  vat: ["vat", "vat amount", "tax", "tax amount"],
  paid: ["amount paid", "paid", "payment", "payments", "allocated"],
  credit: ["credit", "credit amount"],
  type: ["type", "document type", "doc type", "transaction type"],
};

/** Statement rows → lines. `supplierName` is used when the file has no supplier column. */
export function readStatementLines(table: CsvTable, supplierName: string | null): { lines: StatementLine[]; skipped: Array<{ row: number; reason: string }> } {
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, pickColumn(table.header, names)])) as Record<keyof typeof COLUMNS, string | null>;
  if (!col.number) throw new ReconciliationError("The file has no invoice number column (e.g. 'Invoice Number', 'Reference').");
  if (!col.total && !col.credit) throw new ReconciliationError("The file has no total / amount column.");
  if (!col.supplier && !String(supplierName || "").trim()) throw new ReconciliationError("The file has no supplier column: choose the supplier this statement is from.");

  const lines: StatementLine[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];
  for (const record of table.records) {
    const v = (key: keyof typeof COLUMNS) => (col[key] ? String(record.values[col[key]!] ?? "").trim() : "");
    const number = v("number");
    if (!number) {
      skipped.push({ row: record.row, reason: "No invoice number (e.g. a balance or total row)." });
      continue;
    }
    const supplier = v("supplier") || String(supplierName || "").trim();
    let total = parseAmount(v("total"));
    const credit = parseAmount(v("credit"));
    if ((total === null || total === 0) && credit) total = -Math.abs(credit);
    const typeText = v("type").toLowerCase();
    const isCredit = /credit|^cn$|^crn$|^c\/n$/.test(typeText) || /^(CN|CRN|CR)[-\s]?\d/i.test(number) || (total !== null && total < 0);
    if (total === null) {
      skipped.push({ row: record.row, reason: `Amount "${v("total")}" could not be read.` });
      continue;
    }
    const vat = parseAmount(v("vat"));
    lines.push({
      row: record.row,
      supplierName: supplier,
      invoiceNumber: number,
      documentType: isCredit ? "CREDIT_NOTE" : "INVOICE",
      invoiceDate: parseDateCell(v("date")),
      dueDate: parseDateCell(v("due")),
      total: isCredit ? -Math.abs(total) : total,
      vat: vat === null ? null : isCredit ? -Math.abs(vat) : vat,
      amountPaid: parseAmount(v("paid")),
    });
  }
  return { lines, skipped };
}

/** Compare statement lines with VOLORA's supplier invoices. Pure. */
export function reconcileStatement(statement: StatementLine[], volora: SupplierInvoiceRegisterRow[]): { lines: ReconLine[]; summary: ReconSummary } {
  const supplierKey = (name: string | null | undefined) => normalisedNameKey(String(name || ""));
  const statementSuppliers = new Set(statement.map((l) => supplierKey(l.supplierName)));
  const voloraBy = new Map<string, SupplierInvoiceRegisterRow[]>();
  for (const row of volora) {
    const key = `${supplierKey(row.supplier_name)}|${invoiceNumberKey(row.invoice_number)}`;
    voloraBy.set(key, [...(voloraBy.get(key) || []), row]);
  }
  const statementCount = new Map<string, number>();
  for (const l of statement) {
    const key = `${supplierKey(l.supplierName)}|${invoiceNumberKey(l.invoiceNumber)}`;
    statementCount.set(key, (statementCount.get(key) || 0) + 1);
  }

  const out: ReconLine[] = [];
  const usedVolora = new Set<string>();
  for (const l of statement) {
    const key = `${supplierKey(l.supplierName)}|${invoiceNumberKey(l.invoiceNumber)}`;
    const matches = voloraBy.get(key) || [];
    matches.forEach((m) => usedVolora.add(m.id));
    const base = {
      supplierName: l.supplierName,
      invoiceNumber: l.invoiceNumber,
      documentType: l.documentType,
      supplierDate: l.invoiceDate,
      dueDate: l.dueDate,
      supplierTotal: l.total,
      supplierVat: l.vat,
      amountPaid: l.amountPaid,
      sourceRow: l.row,
    };
    const one = matches.length === 1 ? matches[0] : null;
    const voloraTotal = one && one.total !== null ? Number(one.total) : null;
    const voloraVat = one && one.vat !== null ? Number(one.vat) : null;
    const difference = l.total !== null && voloraTotal !== null ? r2(l.total - voloraTotal) : null;
    const vatDifference = l.vat !== null && voloraVat !== null ? r2(l.vat - voloraVat) : null;
    const ref = matches.map((m) => `${m.origin === "document" ? "Invoice Intelligence" : "Register"} ${m.invoice_number}`).join(", ") || null;

    if ((statementCount.get(key) || 0) > 1) {
      out.push({ ...base, status: "DUPLICATE", voloraTotal, voloraVat, difference, vatDifference, voloraRef: ref, notes: "The same invoice number appears more than once on the supplier document." });
    } else if (matches.length > 1) {
      out.push({ ...base, status: "DUPLICATE", voloraTotal: null, voloraVat: null, difference: null, vatDifference: null, voloraRef: ref, notes: `Captured ${matches.length} times in VOLORA.` });
    } else if (l.documentType === "CREDIT_NOTE") {
      out.push({
        ...base,
        status: "CREDIT_NOTE",
        voloraTotal,
        voloraVat,
        difference,
        vatDifference,
        voloraRef: ref,
        notes: one ? "Credit note found in VOLORA." : "Supplier credit note — not captured in VOLORA.",
      });
    } else if (!one) {
      out.push({ ...base, status: "MISSING_IN_VOLORA", voloraTotal: null, voloraVat: null, difference: null, vatDifference: null, voloraRef: null, notes: "Not found in VOLORA." });
    } else if (difference !== null && Math.abs(difference) > RECON_TOLERANCE) {
      out.push({ ...base, status: "TOTAL_DIFFERENCE", voloraTotal, voloraVat, difference, vatDifference, voloraRef: ref, notes: `Supplier total differs by ${difference.toFixed(2)}.` });
    } else if (vatDifference !== null && Math.abs(vatDifference) > RECON_TOLERANCE) {
      out.push({ ...base, status: "VAT_DIFFERENCE", voloraTotal, voloraVat, difference, vatDifference, voloraRef: ref, notes: `VAT differs by ${vatDifference.toFixed(2)}.` });
    } else {
      out.push({ ...base, status: "MATCHED", voloraTotal, voloraVat, difference: difference ?? 0, vatDifference, voloraRef: ref, notes: "" });
    }
  }

  // VOLORA invoices of the same supplier(s), inside the statement's period, that the supplier did not list.
  const dates = statement.map((l) => l.invoiceDate).filter((d): d is string => Boolean(d)).sort();
  const periodFrom = dates[0] ?? null;
  const periodTo = dates[dates.length - 1] ?? null;
  for (const row of volora) {
    if (usedVolora.has(row.id) || !statementSuppliers.has(supplierKey(row.supplier_name))) continue;
    if (!periodFrom || !periodTo || !row.invoice_date || row.invoice_date < periodFrom || row.invoice_date > periodTo) continue;
    out.push({
      status: "NOT_ON_SUPPLIER_DOCUMENT",
      supplierName: row.supplier_name,
      invoiceNumber: row.invoice_number,
      documentType: "INVOICE",
      supplierDate: null,
      dueDate: null,
      supplierTotal: null,
      supplierVat: null,
      amountPaid: null,
      voloraTotal: row.total === null ? null : Number(row.total),
      voloraVat: row.vat === null ? null : Number(row.vat),
      difference: null,
      vatDifference: null,
      voloraRef: `${row.origin === "document" ? "Invoice Intelligence" : "Register"} ${row.invoice_number} (${row.invoice_date})`,
      sourceRow: null,
      notes: "In VOLORA, but not on the supplier document.",
    });
  }

  const count = (s: ReconStatus) => out.filter((l) => l.status === s).length;
  const onStatement = out.filter((l) => l.sourceRow !== null);
  const supplierValue = r2(onStatement.reduce((t, l) => t + (l.supplierTotal ?? 0), 0));
  const voloraValue = r2(onStatement.reduce((t, l) => t + (l.voloraTotal ?? 0), 0));
  return {
    lines: out,
    summary: {
      supplierInvoices: onStatement.length,
      matched: count("MATCHED"),
      missing: count("MISSING_IN_VOLORA"),
      totalDifferences: count("TOTAL_DIFFERENCE"),
      vatDifferences: count("VAT_DIFFERENCE"),
      duplicates: count("DUPLICATE"),
      creditNotes: count("CREDIT_NOTE"),
      notOnSupplierDocument: count("NOT_ON_SUPPLIER_DOCUMENT"),
      supplierValue,
      voloraValue,
      difference: r2(supplierValue - voloraValue),
      periodFrom,
      periodTo,
    },
  };
}

/** Parse, reconcile against this company's register, and keep the run. Writes only the reconciliation record. */
export async function runSupplierReconciliation(
  supabase: SupabaseClient,
  companyId: string,
  input: { table: CsvTable; sha256: string; fileName: string; supplierName: string | null },
  actor: string
) {
  const { lines: statement, skipped } = readStatementLines(input.table, input.supplierName);
  if (!statement.length) throw new ReconciliationError("No invoice lines could be read from the file.");
  return recordReconciliation(supabase, companyId, { statement, skipped, sha256: input.sha256, fileName: input.fileName }, actor);
}

/**
 * The approved lines of an extracted PDF statement → statement lines. Only invoices and credit notes
 * read without an error are reconciled; payments / journals are read but not matched to invoices,
 * and excluded lines are reported as skipped with their reason.
 */
export function statementLinesFromExtraction(extraction: StatementExtraction, supplierName: string): { lines: StatementLine[]; skipped: Array<{ row: number; reason: string }> } {
  const lines: StatementLine[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];
  for (const t of extraction.transactions) {
    if (t.status === "EXCLUDED") {
      skipped.push({ row: t.index, reason: `Page ${t.page}: ${t.flags.filter((f) => f.severity === "error").map((f) => f.message).join(" ")}` });
      continue;
    }
    if (t.status !== "RECONCILE") continue;
    const isCredit = t.type === "CREDIT_NOTE";
    const amount = r2((t.debit ?? 0) - (t.credit ?? 0));
    lines.push({
      row: t.index,
      supplierName,
      invoiceNumber: t.reference!,
      documentType: isCredit ? "CREDIT_NOTE" : "INVOICE",
      invoiceDate: t.date,
      dueDate: t.dueDate,
      total: isCredit ? -Math.abs(amount) : amount,
      vat: null,
      amountPaid: null,
    });
  }
  return { lines, skipped };
}

/**
 * Reconcile a PDF statement the user reviewed and approved. The PDF is read again and must give
 * exactly the extraction that was reviewed (same digest); otherwise nothing runs. Writes only the
 * reconciliation record, as a CSV / Excel reconciliation does.
 */
export async function runApprovedStatementReconciliation(
  supabase: SupabaseClient,
  companyId: string,
  input: { bytes: Uint8Array; fileName: string; approvedDigest: string; supplierName: string; ownCompanyNames: string[]; approvedBy: string },
  actor: string
) {
  const supplierName = String(input.supplierName || "").trim();
  if (!supplierName) throw new ReconciliationError("Choose the supplier this statement is from before approving it.");
  const extraction = await extractSupplierStatementPdf(input.bytes, { ownCompanyNames: input.ownCompanyNames });
  if (!input.approvedDigest || extraction.digest !== input.approvedDigest)
    throw new ReconciliationError("The statement is not the one that was reviewed. Upload it again and review the extracted lines before approving.");
  const { lines: statement, skipped } = statementLinesFromExtraction(extraction, supplierName);
  if (!statement.length) throw new ReconciliationError("The statement has no invoice or credit-note lines that could be read with confidence; nothing to reconcile.");
  return recordReconciliation(
    supabase,
    companyId,
    {
      statement,
      skipped,
      sha256: extraction.fileSha256,
      fileName: input.fileName,
      extraSummary: {
        statement: {
          source: "pdf",
          extractionDigest: extraction.digest,
          approvedBy: input.approvedBy,
          approvedAt: new Date().toISOString(),
          supplierDetected: extraction.supplier.value,
          supplierApproved: supplierName,
          accountNumber: extraction.accountNumber.value,
          statementDate: extraction.statementDate.value,
          periodFrom: extraction.periodFrom.value,
          periodTo: extraction.periodTo.value,
          openingBalance: extraction.openingBalance.value,
          closingBalance: extraction.closingBalance.value,
          balanceCheck: extraction.balanceCheck,
          counts: extraction.counts,
          pageCount: extraction.pageCount,
          layout: extraction.layout,
          dateOrder: extraction.dateOrder,
          warnings: extraction.warnings,
          unreadLines: extraction.unreadLines.length,
        },
      },
    },
    actor
  );
}

// ---------------------------------------------------------------------------------------------
// Interpreted PDF statements (Phase 2): matching on the reviewed AI interpretation
// ---------------------------------------------------------------------------------------------

/** VOLORA's supplier invoices with the PO numbers linked to them, as match candidates. Read-only. */
export async function loadStatementMatchCandidates(supabase: SupabaseClient, companyId: string): Promise<MatchCandidate[]> {
  const { invoices } = await listSupplierInvoiceRegister(supabase, companyId);
  const poIds = [...new Set(invoices.map((i) => i.matched_po_id).filter((id): id is string => Boolean(id)))];
  const poNumber = new Map<string, string>();
  for (let i = 0; i < poIds.length; i += 200) {
    const { data, error } = await supabase.from("vyron_cost_purchase_orders").select("id, po_number").eq("company_id", companyId).in("id", poIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const po of data || []) if (po.po_number) poNumber.set(String(po.id), String(po.po_number));
  }
  return invoices.map((i) => ({
    id: i.id,
    invoiceNumber: i.invoice_number && i.invoice_number !== "—" ? i.invoice_number : null,
    invoiceDate: i.invoice_date,
    total: i.total === null ? null : Number(i.total),
    supplierName: i.supplier_name,
    poNumber: i.matched_po_id ? poNumber.get(i.matched_po_id) ?? null : null,
    origin: i.origin,
  }));
}

function verifiedReview(companyId: string, body: string, signature: string) {
  const payload = verifyReviewedInterpretation(body, signature, { companyId });
  if (!payload) throw new ReconciliationError("The reviewed statement could not be verified (it was changed, has expired, or belongs to another company). Upload it again and review it before approving.");
  return payload;
}

/** Match a reviewed (signed) interpretation against VOLORA for the confirmed supplier. Writes nothing. */
export async function previewInterpretedStatementMatch(supabase: SupabaseClient, companyId: string, input: { reviewBody: string; reviewSignature: string; supplierName: string }): Promise<StatementMatchResult> {
  const supplierName = String(input.supplierName || "").trim();
  if (!supplierName) throw new ReconciliationError("Choose the supplier this statement is from first.");
  const payload = verifiedReview(companyId, input.reviewBody, input.reviewSignature);
  return matchInterpretedStatement(payload.interpretation, await loadStatementMatchCandidates(supabase, companyId), supplierName);
}

/**
 * Reconcile an interpreted PDF statement the user reviewed and approved. The PDF is read again and must
 * give exactly the extraction that was reviewed; the interpretation must carry the server's signature
 * for that extraction and company, and its dates and amounts must be the reader's. The AI is not asked
 * again. Matching is deterministic (vyron-supplier-statement-match.ts). Writes only the reconciliation
 * record, and only for supplier documents (invoices, credit notes, debit notes): payments, receipts and
 * other rows are excluded and nothing is allocated or posted. The categories the database's line
 * status does not hold are stored on an allowed status with the detail in the notes, and in full in
 * summary.statement.differences: Date Difference → MATCHED (identified by number; the date is
 * reported), Amount / Credit-Debit Note Difference → TOTAL_DIFFERENCE, debit notes → INVOICE lines.
 */
export async function runApprovedInterpretedStatementReconciliation(
  supabase: SupabaseClient,
  companyId: string,
  input: { bytes: Uint8Array; fileName: string; approvedDigest: string; supplierName: string; ownCompanyNames: string[]; approvedBy: string; reviewBody: string; reviewSignature: string },
  actor: string
) {
  const supplierName = String(input.supplierName || "").trim();
  if (!supplierName) throw new ReconciliationError("Choose the supplier this statement is from before approving it.");
  const extraction = await extractSupplierStatementPdf(input.bytes, { ownCompanyNames: input.ownCompanyNames });
  if (!input.approvedDigest || extraction.digest !== input.approvedDigest)
    throw new ReconciliationError("The statement is not the one that was reviewed. Upload it again and review the extracted lines before approving.");
  const payload = verifiedReview(companyId, input.reviewBody, input.reviewSignature);
  if (payload.extractionDigest !== extraction.digest || payload.fileSha256 !== extraction.fileSha256)
    throw new ReconciliationError("The reviewed interpretation belongs to a different statement. Upload it again and review it before approving.");
  const interpretation = payload.interpretation;
  const sameNumbers =
    interpretation.lines.length === extraction.transactions.length &&
    interpretation.lines.every((l, i) => {
      const t = extraction.transactions[i];
      return l.index === t.index && l.date === t.date && l.debit === t.debit && l.credit === t.credit && l.balance === t.balance;
    });
  if (!sameNumbers) throw new ReconciliationError("The reviewed interpretation does not carry the statement's own dates and amounts. Upload it again and review it before approving.");

  const match = matchInterpretedStatement(interpretation, await loadStatementMatchCandidates(supabase, companyId), supplierName);
  const byIndex = new Map(interpretation.lines.map((l) => [l.index, l]));
  const reconLines: ReconLine[] = [];
  const storedStatus: Record<Exclude<StatementMatchStatus, "NOT_RECONCILED">, ReconStatus> = {
    MATCHED: "MATCHED",
    DATE_DIFFERENCE: "MATCHED",
    AMOUNT_DIFFERENCE: "TOTAL_DIFFERENCE",
    NOTE_DIFFERENCE: "TOTAL_DIFFERENCE",
    DUPLICATE: "DUPLICATE",
    MISSING_IN_VOLORA: "MISSING_IN_VOLORA",
    NEEDS_REVIEW: "NEEDS_REVIEW",
  };
  for (const m of match.lines) {
    if (m.status === "NOT_RECONCILED") continue;
    const l = byIndex.get(m.index)!;
    const refs = l.secondaryReferences.length ? ` References: ${l.secondaryReferences.join(", ")}.` : "";
    const review = l.needsReview ? ` Review: ${l.reviewReasons.join(" ")}` : "";
    const kind = m.status === "DATE_DIFFERENCE" ? "Date difference. " : m.status === "NOTE_DIFFERENCE" ? `${m.documentType === "debit_note" ? "Debit" : "Credit"} note difference. ` : m.documentType === "debit_note" ? "Debit note. " : "";
    reconLines.push({
      status: storedStatus[m.status],
      supplierName,
      invoiceNumber: l.documentNumber,
      documentType: l.type === "credit_note" ? "CREDIT_NOTE" : "INVOICE",
      supplierDate: l.date,
      dueDate: null,
      supplierTotal: m.statementAmount,
      supplierVat: null,
      amountPaid: null,
      voloraTotal: m.voloraTotal,
      voloraVat: null,
      difference: m.difference,
      vatDifference: null,
      voloraRef: m.voloraInvoiceNumber ? `${m.method === "amount_date" ? "Amount + date" : m.method === "reference" ? "Reference" : "Document number"}: ${m.voloraInvoiceNumber}` : null,
      sourceRow: l.index,
      notes: `${kind}${m.note}${refs}${review}`.trim(),
    });
  }
  for (const c of match.notOnStatement)
    reconLines.push({ status: "NOT_ON_SUPPLIER_DOCUMENT", supplierName: c.supplierName, invoiceNumber: c.invoiceNumber, documentType: "INVOICE", supplierDate: null, dueDate: null, supplierTotal: null, supplierVat: null, amountPaid: null, voloraTotal: c.total, voloraVat: null, difference: null, vatDifference: null, voloraRef: `${c.origin === "document" ? "Invoice Intelligence" : "Register"} ${c.invoiceNumber} (${c.invoiceDate})`, sourceRow: null, notes: "In VOLORA, but not on the supplier statement." });
  if (!reconLines.some((l) => l.sourceRow !== null)) throw new ReconciliationError("The statement has no invoices, credit notes or debit notes to reconcile.");

  const onStatement = reconLines.filter((l) => l.sourceRow !== null);
  const supplierValue = Math.round(onStatement.reduce((t, l) => t + (l.supplierTotal ?? 0), 0) * 100) / 100;
  const voloraValue = Math.round(onStatement.reduce((t, l) => t + (l.voloraTotal ?? 0), 0) * 100) / 100;
  const summary: ReconSummary = {
    supplierInvoices: onStatement.length,
    matched: match.summary.matched,
    missing: match.summary.missing,
    totalDifferences: match.summary.amountDifferences + match.summary.noteDifferences,
    vatDifferences: 0,
    duplicates: match.summary.duplicates,
    creditNotes: match.summary.creditNotes,
    notOnSupplierDocument: match.summary.notOnStatement,
    supplierValue,
    voloraValue,
    difference: Math.round((supplierValue - voloraValue) * 100) / 100,
    periodFrom: match.summary.periodFrom,
    periodTo: match.summary.periodTo,
    needsReview: match.summary.needsReview,
    dateDifferences: match.summary.dateDifferences,
  };
  const excludedByType: Record<string, number> = {};
  for (const l of interpretation.lines) if (!isSupplierDocument(l)) excludedByType[l.type] = (excludedByType[l.type] || 0) + 1;
  return recordReconciliation(
    supabase,
    companyId,
    {
      statement: [],
      supplierName,
      // Payments, receipts and other rows are not supplier documents: counted under statement.excludedRows, never listed as skipped.
      skipped: [],
      sha256: extraction.fileSha256,
      fileName: input.fileName,
      precomputed: { lines: reconLines, summary },
      extraSummary: {
        statement: {
          source: "pdf",
          interpretation: { aiStatus: interpretation.aiStatus, model: interpretation.model, usage: interpretation.usage, counts: interpretation.counts, columns: interpretation.columns },
          matching: { method: "supplier-documents-v2", windowDays: AMOUNT_DATE_WINDOW_DAYS, ...match.summary },
          // Every supplier document where the statement and VOLORA disagree (all categories, incl. Date Difference).
          differences: match.differences,
          extractionDigest: extraction.digest,
          approvedBy: input.approvedBy,
          approvedAt: new Date().toISOString(),
          supplierDetected: extraction.supplier.value,
          supplierSuggested: interpretation.metadata.supplierName.value,
          supplierApproved: supplierName,
          statementDate: interpretation.metadata.statementDate.value ?? extraction.statementDate.value,
          // For the Differences Report header (reporting only).
          accountNumber: extraction.accountNumber.value ?? interpretation.metadata.supplierAccountNumber.value,
          statementPeriodFrom: extraction.periodFrom.value,
          statementPeriodTo: extraction.periodTo.value,
          openingBalance: extraction.openingBalance.value,
          closingBalance: extraction.closingBalance.value,
          balanceCheck: extraction.balanceCheck,
          pageCount: extraction.pageCount,
          // Rows outside the population, by type — kept for audit only; not matched, counted or reported as differences.
          excludedRows: excludedByType,
          reviewItems: interpretation.lines.filter((l) => l.needsReview).map((l) => ({ row: l.index, type: l.type, reasons: l.reviewReasons })),
        },
      },
    },
    actor
  );
}

/** Reconcile statement lines against this company's register and keep the run. Writes only the reconciliation record. */
async function recordReconciliation(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    statement: StatementLine[];
    /** The confirmed supplier when the lines are precomputed (the statement list is then empty). */
    supplierName?: string;
    skipped: Array<{ row: number; reason: string }>;
    sha256: string;
    fileName: string;
    extraSummary?: Record<string, unknown>;
    /** Lines already decided by the interpreted-statement matcher (PDF path); otherwise reconcileStatement decides. */
    precomputed?: { lines: ReconLine[]; summary: ReconSummary };
  },
  actor: string
) {
  const { statement, skipped } = input;
  const { lines, summary } = input.precomputed ?? reconcileStatement(statement, (await listSupplierInvoiceRegister(supabase, companyId)).invoices);
  const suppliers = [...new Set(statement.map((l) => l.supplierName))];
  const { data: header, error } = await supabase
    .from("vyron_supplier_reconciliations")
    .insert({
      company_id: companyId,
      supplier_name: input.supplierName ?? (suppliers.length === 1 ? suppliers[0] : `${suppliers.length} suppliers`),
      source_file_name: input.fileName.slice(0, 300),
      source_sha256: input.sha256,
      period_from: summary.periodFrom,
      period_to: summary.periodTo,
      summary: { ...summary, skippedRows: skipped, ...(input.extraSummary || {}) },
      created_by: actor,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  if (lines.length) {
    const { error: linesError } = await supabase.from("vyron_supplier_reconciliation_lines").insert(
      lines.map((l) => ({
        company_id: companyId,
        reconciliation_id: header.id,
        status: l.status,
        supplier_name: l.supplierName,
        invoice_number: l.invoiceNumber,
        document_type: l.documentType,
        supplier_date: l.supplierDate,
        due_date: l.dueDate,
        supplier_total: l.supplierTotal,
        supplier_vat: l.supplierVat,
        amount_paid: l.amountPaid,
        volora_total: l.voloraTotal,
        volora_vat: l.voloraVat,
        difference: l.difference,
        vat_difference: l.vatDifference,
        volora_ref: l.voloraRef,
        source_row: l.sourceRow,
        notes: l.notes || null,
      }))
    );
    if (linesError) throw new Error(linesError.message);
  }
  return { reconciliation: header, lines, summary: input.extraSummary ? { ...summary, ...input.extraSummary } : summary, skipped };
}

/** This company's own name(s) — never read as the supplier — and its supplier names, for the review screen. Read-only. */
export async function loadStatementContext(supabase: SupabaseClient, companyId: string): Promise<{ ownCompanyNames: string[]; supplierNames: string[] }> {
  const [{ data: workspaces, error: wsError }, { data: suppliers, error: supError }] = await Promise.all([
    supabase.from("vyron_workspaces").select("company_name").eq("company_id", companyId),
    supabase.from("vyron_cost_suppliers").select("supplier_name").eq("company_id", companyId).limit(2000),
  ]);
  if (wsError) throw new Error(wsError.message);
  if (supError) throw new Error(supError.message);
  const clean = (v: unknown) => String(v ?? "").trim();
  return {
    ownCompanyNames: [...new Set((workspaces || []).map((w) => clean(w.company_name)).filter(Boolean))].sort(),
    supplierNames: [...new Set((suppliers || []).map((s) => clean(s.supplier_name)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  };
}

export async function listSupplierReconciliations(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase.from("vyron_supplier_reconciliations").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getSupplierReconciliation(supabase: SupabaseClient, companyId: string, id: string) {
  const { data: header, error } = await supabase.from("vyron_supplier_reconciliations").select("*").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!header) return null;
  const { data: lines, error: linesError } = await supabase.from("vyron_supplier_reconciliation_lines").select("*").eq("reconciliation_id", id).eq("company_id", companyId).order("source_row", { ascending: true, nullsFirst: false });
  if (linesError) throw new Error(linesError.message);
  return { reconciliation: header, lines: lines || [] };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The report as CSV (export). */
export function reconciliationCsv(lines: Array<Record<string, unknown>>): string {
  const head = ["Status", "Supplier", "Invoice Number", "Type", "Supplier Date", "Due Date", "Supplier Total", "VOLORA Total", "Difference", "Supplier VAT", "VOLORA VAT", "VAT Difference", "Amount Paid", "VOLORA Reference", "Notes"];
  const rows = lines.map((l) =>
    [l.status, l.supplier_name, l.invoice_number, l.document_type, l.supplier_date, l.due_date, l.supplier_total, l.volora_total, l.difference, l.supplier_vat, l.volora_vat, l.vat_difference, l.amount_paid, l.volora_ref, l.notes].map(csvCell).join(",")
  );
  return [head.join(","), ...rows].join("\r\n");
}
