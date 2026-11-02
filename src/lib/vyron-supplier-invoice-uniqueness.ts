import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown> & { id: unknown };

/**
 * One supplier invoice number may be processed once per supplier.
 *
 * Supplier invoices live in two places: the supplier invoice register
 * (vyron_cost_supplier_invoices — imports and edits, linked by supplier_id) and
 * Invoice Intelligence (vyron_documents — uploaded invoices, linked by supplier
 * name, processed when approved). A duplicate in either must stop the other,
 * so every path that captures, edits, validates or approves a supplier invoice
 * asks findDuplicateSupplierInvoice first and refuses with
 * DuplicateSupplierInvoiceError.
 *
 * Order matters: an approved Invoice Intelligence document is checked first —
 * the invoice was processed there (or its PDF is already linked to the
 * register). A match in the register alone means the invoice exists but its PDF
 * may still be linked to it once (see the approve route).
 *
 * Numbers compare on letters and digits only, case-insensitively: "INV-0910",
 * "inv 0910" and "INV0910" from one supplier are the same invoice. A blank
 * number is never treated as a duplicate (it is caught as missing elsewhere).
 */
export function normaliseInvoiceNumber(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normaliseSupplierName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** ilike treats % and _ as wildcards; a supplier name must match literally. */
function ilikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type DuplicateSupplierInvoiceMatch = {
  store: "register" | "document";
  id: string;
  invoiceNumber: string;
  supplierName: string;
  invoiceDate: string | null;
  href: string;
};

export class DuplicateSupplierInvoiceError extends Error {
  readonly status = 409;
  constructor(readonly match: DuplicateSupplierInvoiceMatch) {
    super(duplicateSupplierInvoiceMessage(match));
    this.name = "DuplicateSupplierInvoiceError";
  }
}

export function duplicateSupplierInvoiceMessage(match: DuplicateSupplierInvoiceMatch): string {
  const where = match.store === "register" ? "in the Supplier Invoice Register" : "as an approved Invoice Intelligence document";
  const dated = match.invoiceDate ? `, dated ${String(match.invoiceDate).slice(0, 10)}` : "";
  return `Duplicate supplier invoice: ${match.supplierName} invoice ${match.invoiceNumber} has already been captured ${where}${dated}. Duplicate supplier invoices cannot be processed.`;
}

export type DuplicateSupplierInvoiceQuery = {
  companyId: string;
  invoiceNumber: unknown;
  /** Register suppliers are linked by id; documents by name. Either (or both) may be given. */
  supplierId?: string | null;
  supplierName?: string | null;
  /** The record being checked, so it never matches itself. */
  excludeInvoiceId?: string | null;
  excludeDocumentId?: string | null;
};

export async function findDuplicateSupplierInvoice(
  supabase: SupabaseClient,
  query: DuplicateSupplierInvoiceQuery
): Promise<DuplicateSupplierInvoiceMatch | null> {
  const wanted = normaliseInvoiceNumber(query.invoiceNumber);
  if (!wanted || !query.companyId) return null;

  // Resolve the supplier both ways: the register needs its id, documents its name.
  let supplierId = query.supplierId ? String(query.supplierId) : null;
  let supplierName = query.supplierName ? String(query.supplierName).trim() : "";
  if (supplierId && !supplierName) {
    const { data, error } = await supabase
      .from("vyron_cost_suppliers")
      .select("id, supplier_name")
      .eq("company_id", query.companyId)
      .eq("id", supplierId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    supplierName = String(data?.supplier_name || "").trim();
  } else if (!supplierId && supplierName) {
    const { data, error } = await supabase
      .from("vyron_cost_suppliers")
      .select("id, supplier_name")
      .eq("company_id", query.companyId)
      .ilike("supplier_name", ilikeLiteral(supplierName));
    if (error) throw new Error(error.message);
    const exact = (data || []).filter((s: Row) => normaliseSupplierName(s.supplier_name) === normaliseSupplierName(supplierName));
    if (exact.length === 1) supplierId = String(exact[0].id);
  }
  if (!supplierId && !supplierName) return null;

  if (supplierName) {
    // A document counts once it has been processed (approved, then archived).
    const { data, error } = await supabase
      .from("vyron_documents")
      .select("id, invoice_number, invoice_date, supplier_name, status, approved_at")
      .eq("tenant_id", query.companyId)
      .ilike("supplier_name", ilikeLiteral(supplierName));
    if (error) throw new Error(error.message);
    const hit = (data || []).find(
      (row: Row) =>
        String(row.id) !== String(query.excludeDocumentId || "") &&
        (String(row.status || "").toLowerCase() === "archived" || Boolean(row.approved_at)) &&
        normaliseSupplierName(row.supplier_name) === normaliseSupplierName(supplierName) &&
        normaliseInvoiceNumber(row.invoice_number) === wanted
    );
    if (hit) {
      return {
        store: "document",
        id: String(hit.id),
        invoiceNumber: String(hit.invoice_number),
        supplierName: String(hit.supplier_name || supplierName),
        invoiceDate: hit.invoice_date ? String(hit.invoice_date) : null,
        href: `/document-intelligence/archive/${hit.id}`,
      };
    }
  }
  if (supplierId) {
    const { data, error } = await supabase
      .from("vyron_cost_supplier_invoices")
      .select("id, invoice_number, invoice_date, supplier_name")
      .eq("company_id", query.companyId)
      .eq("supplier_id", supplierId);
    if (error) throw new Error(error.message);
    const hit = (data || []).find(
      (row: Row) => String(row.id) !== String(query.excludeInvoiceId || "") && normaliseInvoiceNumber(row.invoice_number) === wanted
    );
    if (hit) {
      return {
        store: "register",
        id: String(hit.id),
        invoiceNumber: String(hit.invoice_number),
        supplierName: String(hit.supplier_name || supplierName),
        invoiceDate: hit.invoice_date ? String(hit.invoice_date) : null,
        href: `/supplier-invoices/${hit.id}`,
      };
    }
  }

  return null;
}

/** Throws DuplicateSupplierInvoiceError when the invoice was already captured. */
export async function assertSupplierInvoiceNotDuplicate(supabase: SupabaseClient, query: DuplicateSupplierInvoiceQuery) {
  const match = await findDuplicateSupplierInvoice(supabase, query);
  if (match) throw new DuplicateSupplierInvoiceError(match);
}

/** The JSON body every route returns for a duplicate, so the screens can show it as-is. */
export function duplicateSupplierInvoiceBody(error: DuplicateSupplierInvoiceError) {
  return { ok: false, duplicateInvoice: true, existing: error.match, error: error.message };
}

/** Link key shared by the register merge: same supplier name and the same normalised number. */
export function supplierInvoiceLinkKey(supplierName: unknown, invoiceNumber: unknown): string | null {
  const number = normaliseInvoiceNumber(invoiceNumber);
  if (!number) return null;
  return `${normaliseSupplierName(supplierName)}|${number}`;
}

export function linkedToRegisterMessage(match: DuplicateSupplierInvoiceMatch): string {
  return `${match.supplierName} invoice ${match.invoiceNumber} already exists in the Supplier Invoice Register${match.invoiceDate ? ` (dated ${String(match.invoiceDate).slice(0, 10)})` : ""}. This PDF is linked to it: its lines are compared for costing, and it is not processed again (no second invoice, stock movement or Xero bill).`;
}
