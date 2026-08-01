/**
 * VYRON COST — deterministic duplicate supplier-invoice detection.
 *
 * WHY THIS EXISTS
 * ---------------
 * The architecture audit established that duplicate-invoice protection did not
 * exist. Two things looked like it and were not:
 *
 *   1. `validation.duplicateRisk` on the extraction schema is filled in by the
 *      language model. The model sees one PDF and has no access to the tenant's
 *      other invoices, so it cannot know. It is an impression, not a finding.
 *   2. `vyron_procurement_risk_alerts` rows with `risk_type = 'duplicate_invoice'`
 *      were written only by demo seed SQL (`is_demo = true`). No application
 *      code produced them.
 *
 * This module is the writer. It is entirely deterministic — no AI is consulted
 * and no model output influences the verdict.
 *
 * DETECTION LAYERS — evaluated in order, strongest evidence first
 * --------------------------------------------------------------
 *   Layer 1  SUPPLIER + INVOICE NUMBER   same supplier, same invoice number
 *                                        -> `block`, severity high
 *   Layer 2  DOCUMENT HASH               byte-identical file already uploaded
 *                                        -> `block`, severity high
 *   Layer 3  INVOICE DATE + TOTAL        same supplier, same total, invoice
 *                                        dates within a window
 *                                        -> `warn`, severity medium
 *   Layer 4  OPERATOR REVIEW             same supplier and total, different
 *                                        number -> `review`, severity low
 *
 * The existing document inbox already reads these rows
 * (`vyron-document-intelligence-data.ts` filters `risk_type = 'duplicate_invoice'`
 * and feeds `hasDuplicateRisk` into `mapUiStatus`/`mapRisk`). Writing them
 * therefore lights up the existing UI with no redesign.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DUPLICATE_RISK_TYPE = "duplicate_invoice";

/** Layer 3 window, in days, either side of the candidate invoice date. */
const DATE_WINDOW_DAYS = 7;

export type DuplicateLayer = "supplier-invoice-number" | "document-hash" | "date-total" | "operator-review";

export type DuplicateAction = "block" | "warn" | "review";

export type DuplicateMatch = {
  layer: DuplicateLayer;
  action: DuplicateAction;
  severity: "high" | "medium" | "low";
  matchedDocumentId: string;
  matchedInvoiceNumber: string | null;
  matchedInvoiceDate: string | null;
  matchedTotal: number | null;
  reason: string;
};

export type DuplicateDetectionResult = {
  isDuplicate: boolean;
  action: DuplicateAction | null;
  matches: DuplicateMatch[];
  /** True when Layer 2 could not run because no hash was available. */
  hashLayerUnavailable: boolean;
};

export type DuplicateCandidate = {
  documentId: string;
  tenantId: string;
  supplierId?: string | null;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  total?: number | null;
  fileHash?: string | null;
};

/** SHA-256 of the uploaded bytes. The identity used by Layer 2. */
export function computeDocumentHash(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Comparison key for supplier names — mirrors Supplier Resolution's exact-name rule. */
function supplierKey(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Comparison key for invoice numbers — case and separator insensitive. */
function invoiceKey(value: string | null | undefined): string {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function moneyEquals(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return Math.abs(left - right) / 86_400_000;
}

type DocumentRow = {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total: number | string | null;
  file_hash?: string | null;
};

/**
 * Evaluate every layer against a set of existing documents.
 *
 * Pure: no database access, fully testable, and the same logic runs regardless
 * of where the comparison set came from.
 */
export function evaluateDuplicateLayers(
  candidate: DuplicateCandidate,
  existing: DocumentRow[],
  options: { dateWindowDays?: number; hashAvailable?: boolean } = {}
): DuplicateDetectionResult {
  const windowDays = options.dateWindowDays ?? DATE_WINDOW_DAYS;
  const matches: DuplicateMatch[] = [];

  const candidateSupplier = supplierKey(candidate.supplierName);
  const candidateInvoice = invoiceKey(candidate.invoiceNumber);
  const candidateTotal = candidate.total == null ? null : Number(candidate.total);

  for (const row of existing) {
    if (row.id === candidate.documentId) continue;

    const rowTotal = row.total == null ? null : Number(row.total);
    const sameSupplier =
      (candidate.supplierId && row.supplier_id && candidate.supplierId === row.supplier_id) ||
      (Boolean(candidateSupplier) && candidateSupplier === supplierKey(row.supplier_name));

    // Layer 2 — document hash. Independent of supplier; a byte-identical file
    // is the same document however it was extracted.
    if (candidate.fileHash && row.file_hash && candidate.fileHash === row.file_hash) {
      matches.push({
        layer: "document-hash",
        action: "block",
        severity: "high",
        matchedDocumentId: row.id,
        matchedInvoiceNumber: row.invoice_number,
        matchedInvoiceDate: row.invoice_date,
        matchedTotal: rowTotal,
        reason: "An identical file has already been uploaded.",
      });
      continue;
    }

    if (!sameSupplier) continue;

    // Layer 1 — supplier + invoice number.
    if (candidateInvoice && candidateInvoice === invoiceKey(row.invoice_number)) {
      matches.push({
        layer: "supplier-invoice-number",
        action: "block",
        severity: "high",
        matchedDocumentId: row.id,
        matchedInvoiceNumber: row.invoice_number,
        matchedInvoiceDate: row.invoice_date,
        matchedTotal: rowTotal,
        reason: `Invoice number ${row.invoice_number} already exists for this supplier.`,
      });
      continue;
    }

    if (!moneyEquals(candidateTotal, rowTotal)) continue;

    // Layer 3 — same supplier, same total, invoice dates close together.
    const gap = daysBetween(candidate.invoiceDate, row.invoice_date);
    if (gap !== null && gap <= windowDays) {
      matches.push({
        layer: "date-total",
        action: "warn",
        severity: "medium",
        matchedDocumentId: row.id,
        matchedInvoiceNumber: row.invoice_number,
        matchedInvoiceDate: row.invoice_date,
        matchedTotal: rowTotal,
        reason: `Same supplier and total within ${Math.round(gap)} day(s) of an existing invoice.`,
      });
      continue;
    }

    // Layer 4 — same supplier and total, different number or distant date.
    matches.push({
      layer: "operator-review",
      action: "review",
      severity: "low",
      matchedDocumentId: row.id,
      matchedInvoiceNumber: row.invoice_number,
      matchedInvoiceDate: row.invoice_date,
      matchedTotal: rowTotal,
      reason: "Same supplier and total as an existing invoice with a different number.",
    });
  }

  const order: DuplicateAction[] = ["block", "warn", "review"];
  const action = order.find((candidateAction) => matches.some((match) => match.action === candidateAction)) || null;

  return {
    isDuplicate: matches.length > 0,
    action,
    matches,
    hashLayerUnavailable: options.hashAvailable === false,
  };
}

/**
 * Run detection for a document against its tenant's other documents.
 *
 * `file_hash` is selected optionally: deployments that have not yet applied the
 * hash column continue to work, with Layer 2 reported as unavailable rather
 * than silently passing.
 */
export async function detectDuplicateInvoice(
  supabase: SupabaseClient,
  candidate: DuplicateCandidate,
  options: { dateWindowDays?: number } = {}
): Promise<DuplicateDetectionResult> {
  const columns = "id, supplier_id, supplier_name, invoice_number, invoice_date, total";

  const select = (withHash: boolean) =>
    supabase
      .from("vyron_documents")
      .select(withHash ? `${columns}, file_hash` : columns)
      .eq("tenant_id", candidate.tenantId)
      .is("deleted_at", null)
      .neq("id", candidate.documentId)
      .limit(5000);

  let hashAvailable = true;
  let rows: DocumentRow[] = [];

  const withHash = await select(true);
  if (withHash.error) {
    // Deployments that have not applied the file_hash migration fall back to
    // the other three layers rather than failing detection entirely.
    if (!/file_hash/i.test(withHash.error.message)) {
      return { isDuplicate: false, action: null, matches: [], hashLayerUnavailable: false };
    }
    hashAvailable = false;
    const withoutHash = await select(false);
    if (withoutHash.error) {
      return { isDuplicate: false, action: null, matches: [], hashLayerUnavailable: true };
    }
    rows = (withoutHash.data || []) as unknown as DocumentRow[];
  } else {
    rows = (withHash.data || []) as unknown as DocumentRow[];
  }

  return evaluateDuplicateLayers(candidate, rows, {
    dateWindowDays: options.dateWindowDays,
    hashAvailable,
  });
}

/**
 * Record the verdict as a procurement risk alert, replacing any previous alert
 * for the same document so re-extraction does not accumulate rows.
 *
 * Writes the row shape the existing document inbox already queries. Failure is
 * logged and swallowed: detection must never break extraction.
 */
export async function recordDuplicateInvoiceRisk(
  supabase: SupabaseClient,
  candidate: DuplicateCandidate,
  result: DuplicateDetectionResult
): Promise<void> {
  try {
    await supabase
      .from("vyron_procurement_risk_alerts")
      .delete()
      .eq("tenant_id", candidate.tenantId)
      .eq("risk_type", DUPLICATE_RISK_TYPE)
      .eq("document_id", candidate.documentId);

    if (!result.isDuplicate) return;

    const primary = result.matches[0];
    const { error } = await supabase.from("vyron_procurement_risk_alerts").insert({
      tenant_id: candidate.tenantId,
      supplier_id: candidate.supplierId || null,
      supplier_name: candidate.supplierName || null,
      document_id: candidate.documentId,
      risk_type: DUPLICATE_RISK_TYPE,
      severity: primary.severity,
      title: `Possible duplicate invoice${candidate.invoiceNumber ? ` ${candidate.invoiceNumber}` : ""}`,
      description: result.matches.map((match) => match.reason).join(" "),
      status: "open",
      metadata: {
        detection: "deterministic",
        action: result.action,
        hashLayerUnavailable: result.hashLayerUnavailable,
        matches: result.matches,
      },
    });

    if (error) console.warn("[duplicate-invoice] could not record risk alert", error.message);
  } catch (error) {
    console.warn("[duplicate-invoice] detection recording failed", error instanceof Error ? error.message : String(error));
  }
}

/** Detect and record in one call. Returns the verdict for the caller to surface. */
export async function runDuplicateInvoiceDetection(
  supabase: SupabaseClient,
  candidate: DuplicateCandidate,
  options: { dateWindowDays?: number } = {}
): Promise<DuplicateDetectionResult> {
  const result = await detectDuplicateInvoice(supabase, candidate, options);
  await recordDuplicateInvoiceRisk(supabase, candidate, result);
  return result;
}
