import type { SupabaseClient } from "@supabase/supabase-js";
import { normalisedNameKey } from "@/lib/vyron-supplier-resolution";
import { listSupplierInvoiceRegister, type SupplierInvoiceRegisterRow } from "@/lib/vyron-supplier-invoices";
import { parseAmount, parseDateCell, pickColumn } from "@/lib/vyron-upload-table";
import type { CsvTable } from "@/lib/data-migration/csv";

/**
 * VOLORA — supplier invoice reconciliation.
 *
 * A supplier statement / invoice list is compared with the supplier invoices VOLORA holds (the
 * register: imported invoices and invoices approved in Invoice Intelligence). Matching is on
 * supplier + invoice number — never on amount alone. It is a control: nothing is posted, created
 * or changed in the books; the run itself is kept as a record.
 */

export type ReconStatus = "MATCHED" | "MISSING_IN_VOLORA" | "TOTAL_DIFFERENCE" | "VAT_DIFFERENCE" | "DUPLICATE" | "CREDIT_NOTE" | "NOT_ON_SUPPLIER_DOCUMENT";

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
  const { invoices } = await listSupplierInvoiceRegister(supabase, companyId);
  const { lines, summary } = reconcileStatement(statement, invoices);
  const suppliers = [...new Set(statement.map((l) => l.supplierName))];
  const { data: header, error } = await supabase
    .from("vyron_supplier_reconciliations")
    .insert({
      company_id: companyId,
      supplier_name: suppliers.length === 1 ? suppliers[0] : `${suppliers.length} suppliers`,
      source_file_name: input.fileName.slice(0, 300),
      source_sha256: input.sha256,
      period_from: summary.periodFrom,
      period_to: summary.periodTo,
      summary: { ...summary, skippedRows: skipped },
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
  return { reconciliation: header, lines, summary, skipped };
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
