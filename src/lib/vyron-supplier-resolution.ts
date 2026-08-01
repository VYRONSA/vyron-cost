/**
 * VYRON COST — Supplier Resolution Service.
 *
 * THE SINGLE AUTHORITATIVE SUPPLIER IDENTITY IMPLEMENTATION.
 *
 * WHY THIS EXISTS
 * ---------------
 * The architecture audit found three independent supplier-matching behaviours
 * writing to the same master table:
 *
 *   1. Raw-materials import  — Contact Master, `ilike` exact
 *   2. Admin supplier import — NO check at all; blind insert on every row
 *   3. Invoice review        — `ilike` exact
 *
 * Three writers cannot converge on one supplier identity. This module is the
 * one place that decides whether a supplier already exists.
 *
 * MATCHING HIERARCHY — deterministic, no AI, evaluated in order
 * ------------------------------------------------------------
 *   Tier 1  VAT NUMBER          exact match on normalised VAT number
 *   Tier 2  EXACT NAME          exact match on trimmed name (case-insensitive)
 *   Tier 3  NORMALISED NAME     match after removing legal suffixes,
 *                               punctuation and whitespace noise
 *   Tier 4  FUZZY               similarity >= threshold — PROPOSAL ONLY,
 *                               never applied automatically
 *   Tier 5  CREATE              no match; create with recorded provenance
 *
 * TIER 4 NEVER MERGES AUTOMATICALLY. A wrong merge of two genuinely different
 * suppliers is materially harder to undo than a duplicate: invoices, purchase
 * orders and price history attach to the merged identity and must each be
 * unpicked. A duplicate is additive and can be merged later with full
 * information. The asymmetry is the reason for the rule.
 */

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SupplierMatchTier = "vat" | "exact-name" | "normalised-name" | "fuzzy" | "none";

export type SupplierResolutionOutcome = "matched" | "created" | "proposed" | "failed";

export type SupplierCandidate = {
  id: string;
  supplierName: string;
  vatNumber: string | null;
  similarity: number;
  tier: SupplierMatchTier;
};

export type SupplierResolution = {
  outcome: SupplierResolutionOutcome;
  supplierId: string | null;
  supplierName: string;
  tier: SupplierMatchTier;
  /** Populated when outcome is "proposed": near-matches requiring a human decision. */
  candidates: SupplierCandidate[];
  error?: string;
};

export type SupplierResolutionInput = {
  supplierName: string;
  vatNumber?: string | null;
  contactEmail?: string | null;
  invoiceEmail?: string | null;
  category?: string | null;
  paymentTerms?: string | null;
  riskStatus?: string | null;
};

export type SupplierResolutionOptions = {
  /** Create the supplier when no match is found. Default true. */
  createIfMissing?: boolean;
  /** Similarity at or above which a fuzzy candidate is proposed. 0-1. Default 0.86. */
  fuzzyThreshold?: number;
  /** Where this resolution originated — recorded for provenance. */
  source?: "import" | "invoice" | "manual";
};

const DEFAULT_FUZZY_THRESHOLD = 0.86;

/** Legal-entity suffixes stripped before normalised comparison (South African and common international). */
const LEGAL_SUFFIXES = [
  "proprietary limited",
  "pty ltd",
  "pty limited",
  "pty",
  "ltd",
  "limited",
  "cc",
  "close corporation",
  "inc",
  "incorporated",
  "llc",
  "plc",
  "bv",
  "gmbh",
  "sa",
  "co",
  "company",
  "holdings",
  "group",
  "trading",
  "enterprises",
  "t/a",
];

/** Exact-name key: case- and whitespace-insensitive only. */
export function exactNameKey(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Normalised key: strips punctuation, legal suffixes and the word "the".
 * `Acme Foods (Pty) Ltd.` and `acme foods` both normalise to `acme foods`.
 */
export function normalisedNameKey(value: string): string {
  let key = exactNameKey(value)
    .replace(/[.,()[\]{}'"`]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[-_/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  key = key.replace(/^the\s+/, "");

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (key.endsWith(` ${suffix}`)) {
        key = key.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
    }
  }

  return key.replace(/\s+/g, " ").trim();
}

/** VAT keys compare digits and letters only — spaces, slashes and dashes vary by data entry. */
export function normalisedVatKey(value: string | null | undefined): string {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Levenshtein distance, iterative with a single working row. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 0; i < a.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1;
      current.push(Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + cost));
    }
    previous = current;
  }

  return previous[b.length];
}

/** Similarity in 0..1, derived from edit distance over the longer string. */
export function nameSimilarity(a: string, b: string): number {
  const left = normalisedNameKey(a);
  const right = normalisedNameKey(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const longest = Math.max(left.length, right.length);
  return (longest - levenshtein(left, right)) / longest;
}

type SupplierRow = {
  id: string;
  supplier_name: string | null;
  vat_number?: string | null;
  supplier_vat_number?: string | null;
};

export type SupplierIndex = {
  byVat: Map<string, SupplierRow>;
  byExactName: Map<string, SupplierRow>;
  byNormalisedName: Map<string, SupplierRow>;
  all: SupplierRow[];
};

/**
 * Load every supplier for a company once, into an index.
 *
 * Imports resolve many rows against the same master list; loading per row costs
 * up to four round trips each. Rows are paged explicitly rather than relying on
 * the PostgREST default cap — a silent truncation here would cause false "not
 * found" results and create duplicates, which is the exact defect this service
 * exists to prevent.
 */
export async function loadSupplierIndex(
  supabase: SupabaseClient,
  companyId: string
): Promise<SupplierIndex> {
  const pageSize = 1000;
  const all: SupplierRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("vyron_cost_suppliers")
      .select("id, supplier_name, vat_number")
      .eq("company_id", companyId)
      .range(from, from + pageSize - 1);

    if (error) {
      // `vat_number` may not exist in every deployment — retry without it
      // rather than failing resolution entirely.
      if (/vat_number/i.test(error.message)) {
        const fallback = await supabase
          .from("vyron_cost_suppliers")
          .select("id, supplier_name")
          .eq("company_id", companyId)
          .range(from, from + pageSize - 1);
        if (fallback.error) throw new Error(fallback.error.message);
        all.push(...((fallback.data || []) as SupplierRow[]));
        if (!fallback.data || fallback.data.length < pageSize) break;
        continue;
      }
      throw new Error(error.message);
    }

    all.push(...((data || []) as SupplierRow[]));
    if (!data || data.length < pageSize) break;
  }

  const byVat = new Map<string, SupplierRow>();
  const byExactName = new Map<string, SupplierRow>();
  const byNormalisedName = new Map<string, SupplierRow>();

  for (const row of all) {
    const vat = normalisedVatKey(row.vat_number ?? row.supplier_vat_number);
    if (vat && !byVat.has(vat)) byVat.set(vat, row);

    const exact = exactNameKey(String(row.supplier_name || ""));
    if (exact && !byExactName.has(exact)) byExactName.set(exact, row);

    const normalised = normalisedNameKey(String(row.supplier_name || ""));
    if (normalised && !byNormalisedName.has(normalised)) byNormalisedName.set(normalised, row);
  }

  return { byVat, byExactName, byNormalisedName, all };
}

/** Match against a preloaded index without touching the database. */
export function matchSupplierInIndex(
  index: SupplierIndex,
  input: SupplierResolutionInput,
  options: SupplierResolutionOptions = {}
): { row: SupplierRow | null; tier: SupplierMatchTier; candidates: SupplierCandidate[] } {
  const threshold = options.fuzzyThreshold ?? DEFAULT_FUZZY_THRESHOLD;
  const name = String(input.supplierName || "").trim();

  // Tier 1 — VAT number
  const vatKey = normalisedVatKey(input.vatNumber);
  if (vatKey) {
    const row = index.byVat.get(vatKey);
    if (row) return { row, tier: "vat", candidates: [] };
  }

  if (!name) return { row: null, tier: "none", candidates: [] };

  // Tier 2 — exact name
  const exact = index.byExactName.get(exactNameKey(name));
  if (exact) return { row: exact, tier: "exact-name", candidates: [] };

  // Tier 3 — normalised name
  const normalised = index.byNormalisedName.get(normalisedNameKey(name));
  if (normalised) return { row: normalised, tier: "normalised-name", candidates: [] };

  // Tier 4 — fuzzy. Proposal only; never returned as a match.
  const candidates: SupplierCandidate[] = [];
  for (const row of index.all) {
    const similarity = nameSimilarity(name, String(row.supplier_name || ""));
    if (similarity >= threshold) {
      candidates.push({
        id: row.id,
        supplierName: String(row.supplier_name || ""),
        vatNumber: row.vat_number ?? row.supplier_vat_number ?? null,
        similarity: Math.round(similarity * 1000) / 1000,
        tier: "fuzzy",
      });
    }
  }
  candidates.sort((a, b) => b.similarity - a.similarity);

  return { row: null, tier: "none", candidates: candidates.slice(0, 5) };
}

/**
 * Resolve a supplier to an id, creating one only when no tier matches.
 *
 * Returns `outcome: "proposed"` when fuzzy candidates exist and
 * `createIfMissing` is false — the caller must present the choice to a human.
 * When `createIfMissing` is true, fuzzy candidates are still returned alongside
 * the created id so the caller can surface a possible duplicate for review.
 */
export async function resolveSupplier(
  supabase: SupabaseClient,
  companyId: string,
  input: SupplierResolutionInput,
  options: SupplierResolutionOptions = {},
  preloadedIndex?: SupplierIndex
): Promise<SupplierResolution> {
  const name = String(input.supplierName || "").trim();
  if (!name) {
    return { outcome: "failed", supplierId: null, supplierName: "", tier: "none", candidates: [], error: "supplier_name is required" };
  }

  const index = preloadedIndex || (await loadSupplierIndex(supabase, companyId));
  const { row, tier, candidates } = matchSupplierInIndex(index, input, options);

  if (row) {
    return { outcome: "matched", supplierId: row.id, supplierName: String(row.supplier_name || name), tier, candidates: [] };
  }

  if (options.createIfMissing === false) {
    return {
      outcome: candidates.length ? "proposed" : "failed",
      supplierId: null,
      supplierName: name,
      tier: "none",
      candidates,
      error: candidates.length ? undefined : "No matching supplier found.",
    };
  }

  // Tier 5 — create.
  const id = randomUUID();
  const payload: Record<string, unknown> = {
    id,
    company_id: companyId,
    supplier_name: name,
    category: input.category || "General",
    contact_email: input.contactEmail || null,
    risk_status: input.riskStatus || "Monitor",
  };
  if (input.vatNumber) payload.vat_number = input.vatNumber;
  if (input.invoiceEmail) payload.invoice_email = input.invoiceEmail;
  if (input.paymentTerms) payload.payment_terms = input.paymentTerms;

  let { error } = await supabase.from("vyron_cost_suppliers").insert(payload);

  // Retry without optional columns if the deployment's schema is narrower.
  if (error && /column .* does not exist|schema cache/i.test(error.message)) {
    const minimal = {
      id,
      company_id: companyId,
      supplier_name: name,
      category: input.category || "General",
      contact_email: input.contactEmail || null,
      risk_status: input.riskStatus || "Monitor",
    };
    ({ error } = await supabase.from("vyron_cost_suppliers").insert(minimal));
  }

  if (error) {
    return { outcome: "failed", supplierId: null, supplierName: name, tier: "none", candidates, error: error.message };
  }

  // Keep the in-memory index current so later rows in the same import match.
  const created: SupplierRow = { id, supplier_name: name, vat_number: input.vatNumber || null };
  index.all.push(created);
  index.byExactName.set(exactNameKey(name), created);
  index.byNormalisedName.set(normalisedNameKey(name), created);
  const vatKey = normalisedVatKey(input.vatNumber);
  if (vatKey) index.byVat.set(vatKey, created);

  return { outcome: "created", supplierId: id, supplierName: name, tier: "none", candidates };
}
