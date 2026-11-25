import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Controlled document numbering.
 *
 * CUSTOMER INVOICES. A new invoice is created as a Draft carrying a provisional
 * DRAFT-<random> reference, which is NOT an invoice number and consumes nothing.
 * The official number (default INV-000001, per company) is issued by the
 * database function vyron_issue_customer_invoice_number() when the invoice
 * leaves Draft. That function locks the invoice row and the company's counter
 * row in one transaction, so two users can never receive the same number, a
 * retry returns the number already issued, and every issued number is written
 * to an append-only register. Numbers are never generated in the browser and
 * never taken from a request body.
 *
 * Numbers that are not DRAFT- references — legacy SI- timestamp numbers,
 * imported history (e.g. INV-3393) and the online-store series (WC-/SHP-, which
 * the sync uses to prevent double invoicing) — are kept exactly as they are.
 */

export const DRAFT_REFERENCE_PREFIX = "DRAFT-";
export const CUSTOMER_INVOICE_SERIES = "customer_invoice";
export const JOB_CARD_SERIES = "job_card";

let installedCache: { value: boolean; at: number } | null = null;

/**
 * Whether sequential numbering is installed in this database (migration
 * 20261124130000). Until it is, new invoices keep the previous SI- number so
 * invoicing never breaks; once it is, drafts take DRAFT- references and the
 * official number is issued on issue. A positive answer is cached; a negative
 * one is re-checked after 60 seconds so the switch-over needs no redeploy.
 */
export async function isSequentialNumberingInstalled(supabase: SupabaseClient): Promise<boolean> {
  if (installedCache && (installedCache.value || Date.now() - installedCache.at < 60_000)) return installedCache.value;
  const { error } = await supabase.from("vyron_document_sequences").select("company_id").limit(1);
  const value = !error;
  installedCache = { value, at: Date.now() };
  return value;
}

/** Test hook: forget the cached installation state. */
export function resetNumberingInstalledCache() {
  installedCache = null;
}

/** The number a new invoice is created with when numbering is not installed (previous behaviour). */
export function legacyInvoiceNumber(): string {
  return `SI-${String(Date.now()).slice(-8)}`;
}

export function newDraftInvoiceReference(): string {
  return `${DRAFT_REFERENCE_PREFIX}${randomBytes(5).toString("hex").toUpperCase()}`;
}

export function isDraftReference(invoiceNumber: string | null | undefined): boolean {
  return String(invoiceNumber || "").startsWith(DRAFT_REFERENCE_PREFIX);
}

export class DocumentNumberingUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `Sequential invoice numbering is not installed in this database, so the invoice cannot be issued (${detail}). ` +
        "Nothing was changed — the invoice is still a draft."
    );
    this.name = "DocumentNumberingUnavailableError";
  }
}

const isMissingFunction = (error: { code?: string; message?: string }) =>
  error.code === "PGRST202" ||
  error.code === "42883" ||
  /could not find the function|function .* does not exist/i.test(String(error.message || ""));

/**
 * Issue the official number for one invoice. Idempotent: an invoice that
 * already has an issued number, or that carries a legacy/imported/external
 * number, returns that number and consumes nothing.
 */
export async function issueCustomerInvoiceNumber(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string,
  actor: string
): Promise<{ invoiceNumber: string; newlyIssued: boolean }> {
  const { data, error } = await supabase.rpc("vyron_issue_customer_invoice_number", {
    p_company_id: companyId,
    p_invoice_id: invoiceId,
    p_actor: actor,
  });
  if (error) {
    if (isMissingFunction(error)) throw new DocumentNumberingUnavailableError(error.message);
    if (/INVOICE_NOT_FOUND/.test(error.message)) throw new Error("Invoice not found.");
    if (/INVOICE_NOT_DRAFT/.test(error.message)) throw new Error("Only a draft invoice can be issued a number.");
    throw new Error(`The invoice number could not be issued: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.invoice_number) throw new Error("The invoice number could not be issued: no number returned.");
  return { invoiceNumber: String(row.invoice_number), newlyIssued: Boolean(row.newly_issued) };
}

/** Next number of a non-financial series (job cards). */
export async function nextDocumentNumber(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    seriesKey: string;
    defaultPrefix: string;
    defaultPadding?: number;
    documentType: string;
    documentId: string;
    actor: string;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc("vyron_next_document_number", {
    p_company_id: params.companyId,
    p_series_key: params.seriesKey,
    p_default_prefix: params.defaultPrefix,
    p_default_padding: params.defaultPadding ?? 6,
    p_document_type: params.documentType,
    p_document_id: params.documentId,
    p_actor: params.actor,
  });
  if (error) {
    if (isMissingFunction(error)) throw new DocumentNumberingUnavailableError(error.message);
    throw new Error(`A ${params.documentType} number could not be issued: ${error.message}`);
  }
  if (!data) throw new Error(`A ${params.documentType} number could not be issued.`);
  return String(data);
}

export type DocumentSeries = {
  seriesKey: string;
  prefix: string;
  padding: number;
  nextValue: number;
  issuedCount: number;
  nextNumber: string;
};

/** The company's numbering series with the count already issued. */
export async function listDocumentSeries(supabase: SupabaseClient, companyId: string): Promise<DocumentSeries[] | null> {
  const { data, error } = await supabase
    .from("vyron_document_sequences")
    .select("series_key, prefix, padding, next_value")
    .eq("company_id", companyId);
  if (error) {
    if (/does not exist|could not find|schema cache/i.test(error.message) || error.code === "PGRST205") return null;
    throw new Error(error.message);
  }
  const out: DocumentSeries[] = [];
  const existing = new Map((data || []).map((r) => [String(r.series_key), r]));
  for (const key of [CUSTOMER_INVOICE_SERIES, JOB_CARD_SERIES]) {
    const r = existing.get(key);
    const prefix = r ? String(r.prefix) : key === CUSTOMER_INVOICE_SERIES ? "INV-" : "JC-";
    const padding = r ? Number(r.padding) : 6;
    const nextValue = r ? Number(r.next_value) : 1;
    const { count } = await supabase
      .from("vyron_document_number_register")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("series_key", key)
      .eq("disposition", "ISSUED");
    out.push({
      seriesKey: key,
      prefix,
      padding,
      nextValue,
      issuedCount: count ?? 0,
      nextNumber: `${prefix}${String(nextValue).padStart(padding, "0")}`,
    });
  }
  return out;
}

/**
 * Set the starting number / prefix of a series. Allowed only while NO number
 * has been issued in it, so an issued sequence can never be rewound, skipped
 * backwards or re-prefixed.
 */
export async function configureDocumentSeries(
  supabase: SupabaseClient,
  companyId: string,
  actor: string,
  input: { seriesKey: string; prefix: string; startAt: number; padding?: number }
) {
  const seriesKey = String(input.seriesKey || "");
  if (![CUSTOMER_INVOICE_SERIES, JOB_CARD_SERIES].includes(seriesKey)) throw new Error("Unknown numbering series.");
  const prefix = String(input.prefix || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9/_-]{0,19}$/.test(prefix)) {
    throw new Error("The prefix must be 1–20 letters, digits, '-', '_' or '/' with no spaces.");
  }
  const startAt = Math.floor(Number(input.startAt));
  if (!Number.isFinite(startAt) || startAt < 1 || startAt > 999_999_999) throw new Error("The starting number must be 1 or more.");
  const padding = Math.min(12, Math.max(3, Math.floor(Number(input.padding ?? 6))));

  // Checked and written under the counter's row lock in the database (no check-then-write race).
  const { error } = await supabase.rpc("vyron_configure_document_series", {
    p_company_id: companyId,
    p_series_key: seriesKey,
    p_prefix: prefix,
    p_padding: padding,
    p_start_at: startAt,
    p_actor: actor,
  });
  if (error) {
    if (/SERIES_ALREADY_USED/.test(error.message)) {
      throw new Error("Numbers have already been issued in this series, so its prefix and starting number can no longer change.");
    }
    if (isMissingFunction(error)) throw new DocumentNumberingUnavailableError(error.message);
    throw new Error(error.message);
  }
  return { seriesKey, prefix, padding, nextValue: startAt };
}
