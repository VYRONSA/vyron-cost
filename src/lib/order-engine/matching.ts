import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation, raiseDbError } from "@/lib/order-engine/errors";
import { escapeLike, nameEqualityPattern, normalizeEmail, normalizeName, normalizeSku } from "@/lib/order-engine/normalize";
import type { CustomerMatchRule, MatchCandidate, MatchRule, MatchStatus } from "@/lib/order-engine/types";

/**
 * Deterministic customer and product matching.
 *
 * NEVER fuzzy. Every rung is an equality after minimal normalisation, and each
 * rung either resolves to exactly one record, reports AMBIGUOUS with the exact
 * candidates, or passes to the next rung. Every query is filtered by company.
 *
 * Queries use `eq` for exact values and `ilike` WITHOUT wildcards (with LIKE
 * metacharacters escaped) for case-insensitive equality; the result is then
 * re-checked in code with the same normaliser. The database never returns a
 * "contains" superset, so no row limit can truncate a tenant catalogue.
 * Names are queried word by word (nameEqualityPattern), so differing runs of
 * internal whitespace are still found; the in-code check keeps it an equality.
 * Limitation (documented): a stored SKU or name with stray leading/trailing
 * whitespace is not found — a data-quality issue that surfaces as UNMATCHED,
 * never as a wrong match.
 */

export type ProductRecord = {
  id: string;
  product_name: string | null;
  sku: string | null;
  selling_price: number | null;
  total_cost: number | null;
};

export type ProductMatch = {
  status: Exclude<MatchStatus, "PENDING">;
  rule: MatchRule | null;
  product: ProductRecord | null;
  candidates: MatchCandidate[];
  /** Why the line ended where it did — shown to the reviewer. */
  reason: string;
};

export type CustomerRecord = {
  id: string;
  customer_name: string | null;
  email?: string | null;
  invoice_email?: string | null;
  status?: string | null;
  active?: boolean | null;
  on_hold?: boolean | null;
};

export type CustomerMatch = {
  status: "MATCHED" | "UNMATCHED" | "AMBIGUOUS";
  rule: CustomerMatchRule | null;
  customer: CustomerRecord | null;
  candidates: Array<{ id: string; name: string | null }>;
  reason: string;
};

const PRODUCT_COLUMNS = "id, product_name, sku, selling_price, total_cost";

function toCandidate(product: ProductRecord): MatchCandidate {
  return { productId: product.id, productName: String(product.product_name || ""), sku: product.sku ?? null };
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) if (!seen.has(row.id)) seen.set(row.id, row);
  return [...seen.values()];
}

async function productsWhere(
  supabase: SupabaseClient,
  companyId: string,
  column: "sku" | "product_name" | "id",
  mode: "eq" | "ilike" | "pattern",
  value: string
): Promise<ProductRecord[]> {
  let query = supabase.from("vyron_cost_products").select(PRODUCT_COLUMNS).eq("company_id", companyId);
  // eq: exact · ilike: case-insensitive equality (escaped, no wildcards) · pattern: a prepared nameEqualityPattern.
  query = mode === "eq" ? query.eq(column, value) : query.ilike(column, mode === "pattern" ? value : escapeLike(value));
  const { data, error } = await query;
  if (error) raiseDbError(error, "Product lookup failed");
  return (data || []) as ProductRecord[];
}

/** Load products by id, strictly inside the company. */
export async function loadProductsById(
  supabase: SupabaseClient,
  companyId: string,
  productIds: string[]
): Promise<Map<string, ProductRecord>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from("vyron_cost_products")
    .select(PRODUCT_COLUMNS)
    .eq("company_id", companyId)
    .in("id", ids);
  if (error) raiseDbError(error, "Product lookup failed");
  return new Map(((data || []) as ProductRecord[]).map((row) => [String(row.id), row]));
}

/** Approved aliases: vyron_customer_item_mappings.source_item_code → product. Absent table → no rung. */
async function aliasProductIds(supabase: SupabaseClient, companyId: string, rawSku: string): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("vyron_customer_item_mappings")
    .select("source_item_code, product_id")
    .eq("company_id", companyId)
    .ilike("source_item_code", escapeLike(rawSku.trim()));
  if (error) {
    if (isMissingRelation(error)) return null;
    raiseDbError(error, "Alias lookup failed");
  }
  const target = normalizeSku(rawSku);
  return [
    ...new Set(
      ((data || []) as Array<{ source_item_code: string | null; product_id: string | null }>)
        .filter((row) => row.product_id && normalizeSku(row.source_item_code) === target)
        .map((row) => String(row.product_id))
    ),
  ];
}

function decide(rule: MatchRule, found: ProductRecord[], reasonIfOne: string): ProductMatch | null {
  if (found.length === 1) {
    return { status: "MATCHED", rule, product: found[0], candidates: [toCandidate(found[0])], reason: reasonIfOne };
  }
  if (found.length > 1) {
    return {
      status: "AMBIGUOUS",
      rule: null,
      product: null,
      candidates: found.map(toCandidate),
      reason: `${found.length} products share this identifier (${rule}); none is chosen.`,
    };
  }
  return null;
}

/**
 * Match one order line to a product. The ladder (docs §6):
 *   0 explicit product id (a person chose it) · 2 exact SKU · 3 normalised SKU ·
 *   4 approved alias · 5 exact normalised name, only when the line has no SKU.
 * A line that carries a SKU which is not found is UNMATCHED — it never falls
 * through to a name match.
 */
export async function matchProductForLine(
  supabase: SupabaseClient,
  companyId: string,
  line: { productId?: string | null; rawSku?: string | null; rawDescription?: string | null }
): Promise<ProductMatch> {
  if (line.productId) {
    const byId = await loadProductsById(supabase, companyId, [line.productId]);
    const product = byId.get(line.productId) || null;
    if (!product) {
      return {
        status: "UNMATCHED",
        rule: null,
        product: null,
        candidates: [],
        reason: "The chosen product does not exist in this company.",
      };
    }
    return { status: "MATCHED", rule: "manual", product, candidates: [toCandidate(product)], reason: "Chosen by a person." };
  }

  const rawSku = String(line.rawSku ?? "");
  if (rawSku.trim()) {
    const exact = decide("sku_exact", await productsWhere(supabase, companyId, "sku", "eq", rawSku), "Exact SKU match.");
    if (exact) return exact;

    const target = normalizeSku(rawSku);
    const normalized = (await productsWhere(supabase, companyId, "sku", "ilike", rawSku.trim())).filter(
      (row) => normalizeSku(row.sku) === target
    );
    const byNormalized = decide("sku_normalized", uniqueById(normalized), "SKU match ignoring case and surrounding spaces.");
    if (byNormalized) return byNormalized;

    const aliasIds = await aliasProductIds(supabase, companyId, rawSku);
    if (aliasIds && aliasIds.length) {
      const products = await loadProductsById(supabase, companyId, aliasIds);
      const found = aliasIds.map((id) => products.get(id)).filter(Boolean) as ProductRecord[];
      const byAlias = decide("alias", found, "Approved item-code alias.");
      if (byAlias) return byAlias;
    }

    return {
      status: "UNMATCHED",
      rule: null,
      product: null,
      candidates: [],
      reason: `No product in this company has SKU or approved alias "${rawSku.trim()}".`,
    };
  }

  const description = String(line.rawDescription ?? "");
  if (description.trim()) {
    const target = normalizeName(description);
    const named = (await productsWhere(supabase, companyId, "product_name", "pattern", nameEqualityPattern(description))).filter(
      (row) => normalizeName(row.product_name) === target
    );
    const byName = decide("name_exact", uniqueById(named), "Exact product-name match (line has no SKU) — review.");
    if (byName) return byName;
  }

  return {
    status: "UNMATCHED",
    rule: null,
    product: null,
    candidates: [],
    reason: rawSku.trim() || description.trim() ? "No exact match." : "The line has neither a SKU nor a description.",
  };
}

async function customersWhere(
  supabase: SupabaseClient,
  companyId: string,
  column: "customer_name" | "email" | "invoice_email" | "id",
  mode: "eq" | "ilike" | "pattern",
  value: string
): Promise<CustomerRecord[]> {
  let query = supabase.from("vyron_customers").select("*").eq("company_id", companyId);
  query = mode === "eq" ? query.eq(column, value) : query.ilike(column, mode === "pattern" ? value : escapeLike(value));
  const { data, error } = await query;
  if (error) {
    // invoice_email is a later column; a database without it simply has no such rung.
    if (column === "invoice_email" && String(error.message || "").toLowerCase().includes("column")) return [];
    raiseDbError(error, "Customer lookup failed");
  }
  return (data || []) as CustomerRecord[];
}

/**
 * Identify the customer (docs §5): explicit id · exact normalised name ·
 * sender e-mail (e-mail source only). More than one candidate is AMBIGUOUS.
 */
export async function matchCustomer(
  supabase: SupabaseClient,
  companyId: string,
  input: { customerId?: string | null; customerName?: string | null; senderEmail?: string | null }
): Promise<CustomerMatch> {
  const toCandidates = (rows: CustomerRecord[]) => rows.map((row) => ({ id: row.id, name: row.customer_name ?? null }));

  if (input.customerId) {
    const rows = await customersWhere(supabase, companyId, "id", "eq", input.customerId);
    if (rows.length === 1) {
      return { status: "MATCHED", rule: "customer_id", customer: rows[0], candidates: toCandidates(rows), reason: "Chosen by a person." };
    }
    return { status: "UNMATCHED", rule: null, customer: null, candidates: [], reason: "The chosen customer does not exist in this company." };
  }

  const name = String(input.customerName ?? "");
  if (name.trim()) {
    const target = normalizeName(name);
    const rows = uniqueById(
      (await customersWhere(supabase, companyId, "customer_name", "pattern", nameEqualityPattern(name))).filter(
        (row) => normalizeName(row.customer_name) === target
      )
    );
    if (rows.length === 1) {
      return { status: "MATCHED", rule: "name_exact", customer: rows[0], candidates: toCandidates(rows), reason: "Exact customer-name match." };
    }
    if (rows.length > 1) {
      return { status: "AMBIGUOUS", rule: null, customer: null, candidates: toCandidates(rows), reason: `${rows.length} customers share this name.` };
    }
  }

  const email = normalizeEmail(input.senderEmail);
  if (email) {
    const [byEmail, byInvoiceEmail] = await Promise.all([
      customersWhere(supabase, companyId, "email", "ilike", email),
      customersWhere(supabase, companyId, "invoice_email", "ilike", email),
    ]);
    const rows = uniqueById(
      [...byEmail, ...byInvoiceEmail].filter(
        (row) => normalizeEmail(row.email) === email || normalizeEmail(row.invoice_email) === email
      )
    );
    if (rows.length === 1) {
      return { status: "MATCHED", rule: "sender_email", customer: rows[0], candidates: toCandidates(rows), reason: "Sender e-mail belongs to exactly one customer." };
    }
    if (rows.length > 1) {
      return { status: "AMBIGUOUS", rule: null, customer: null, candidates: toCandidates(rows), reason: `${rows.length} customers use this e-mail address.` };
    }
  }

  return {
    status: "UNMATCHED",
    rule: null,
    customer: null,
    candidates: [],
    reason: name.trim() ? `No customer in this company is named "${name.trim()}".` : "The order does not identify a customer.",
  };
}
