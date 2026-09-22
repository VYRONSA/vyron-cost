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
 * Product ladder (docs/order-engine/VALIDATION_RULES.md):
 *   0 a product a person chose for this line
 *   ½ the line's external product id, linked to exactly one product in
 *     vyron_import_source_links for the order's catalogue system (a recorded
 *     provenance link; no link → the next rung, never a guess)
 *   1 an approved alias for THIS customer's code or description — a recorded
 *     human decision for exactly this customer, so it outranks a coincidental
 *     SKU clash
 *   2 exact SKU · 3 SKU ignoring case and surrounding spaces
 *   4 an approved company-wide alias, then the accounting item-code mappings
 *   5 exact normalised name — only when the line has no SKU (raised for review)
 * A line with a SKU that is not found is UNMATCHED; it never falls to a name.
 *
 * Customer ladder: a customer a person chose · the external customer id via
 * vyron_import_source_links · a remembered source reference
 * (identity map) · exact normalised name · sender e-mail (e-mail source only,
 * raised for review). Names and e-mail are never used to MERGE customers —
 * only to find exactly one; more than one is AMBIGUOUS.
 *
 * Queries use `eq`, or `ilike` with LIKE metacharacters escaped and no
 * wildcards (case-insensitive equality); names are queried word by word
 * (nameEqualityPattern). Every result is re-checked in code with the same
 * normaliser. Limitation (documented): a stored SKU or name with stray
 * leading/trailing whitespace is not found — it surfaces as UNMATCHED, never
 * as a wrong match.
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

/** The key an approved alias is stored under: the SKU when the line has one, else its description. */
export function aliasKeyFor(line: { rawSku?: string | null; rawDescription?: string | null }): string | null {
  const sku = normalizeSku(line.rawSku);
  if (sku) return `sku:${sku}`;
  const description = normalizeName(line.rawDescription);
  return description ? `desc:${description}` : null;
}

/** The key a remembered customer reference is stored under. */
export function identityKeyFor(reference: unknown): string {
  return String(reference ?? "").trim().toLowerCase();
}

async function productsWhere(
  supabase: SupabaseClient,
  companyId: string,
  column: "sku" | "product_name",
  mode: "ilike" | "pattern",
  value: string
): Promise<ProductRecord[]> {
  // ilike: case-insensitive equality (escaped, no wildcards) · pattern: a prepared nameEqualityPattern.
  const { data, error } = await supabase
    .from("vyron_cost_products")
    .select(PRODUCT_COLUMNS)
    .eq("company_id", companyId)
    .ilike(column, mode === "pattern" ? value : escapeLike(value));
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
  const { data, error } = await supabase.from("vyron_cost_products").select(PRODUCT_COLUMNS).eq("company_id", companyId).in("id", ids);
  if (error) raiseDbError(error, "Product lookup failed");
  return new Map(((data || []) as ProductRecord[]).map((row) => [String(row.id), row]));
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

export type ProductMatcher = {
  match(line: { productId?: string | null; rawSku?: string | null; rawDescription?: string | null; externalProductId?: string | null }): Promise<ProductMatch>;
};

/**
 * Entity ids linked to one external key in vyron_import_source_links, strictly
 * inside the company and the stated source system. Absent table → none.
 */
export async function linkedEntityIds(
  supabase: SupabaseClient,
  companyId: string,
  sourceSystem: string,
  sourceEntity: string,
  sourceKey: string,
  entityTypes: string[]
): Promise<string[]> {
  const { data, error } = await supabase
    .from("vyron_import_source_links")
    .select("entity_id, entity_type")
    .eq("company_id", companyId)
    .eq("source_system", sourceSystem)
    .eq("source_entity", sourceEntity)
    .eq("source_key", sourceKey);
  if (error) {
    if (isMissingRelation(error)) return [];
    raiseDbError(error, "Source link lookup failed");
  }
  return [
    ...new Set(
      ((data || []) as Array<{ entity_id: string; entity_type: string }>)
        .filter((row) => entityTypes.includes(String(row.entity_type)))
        .map((row) => String(row.entity_id))
    ),
  ];
}

/**
 * A matcher for one order. Exact SKUs for every line are fetched in one query
 * up front; the rarer rungs are queried per line only when needed.
 */
export async function createProductMatcher(
  supabase: SupabaseClient,
  companyId: string,
  options: {
    customerId?: string | null;
    rawSkus?: Array<string | null | undefined>;
    /** The system external product ids belong to (vyron_import_source_links.source_system). */
    catalogSystem?: string | null;
    /** "off": the exact-name rung is never used (tenant setting). */
    nameMatching?: "review" | "off";
  } = {}
): Promise<ProductMatcher> {
  const exactSkus = [...new Set((options.rawSkus || []).filter((s): s is string => typeof s === "string" && s.trim() !== ""))];
  const exactBySku = new Map<string, ProductRecord[]>();
  for (let i = 0; i < exactSkus.length; i += 200) {
    const chunk = exactSkus.slice(i, i + 200);
    const { data, error } = await supabase.from("vyron_cost_products").select(PRODUCT_COLUMNS).eq("company_id", companyId).in("sku", chunk);
    if (error) raiseDbError(error, "Product lookup failed");
    for (const row of (data || []) as ProductRecord[]) {
      const key = String(row.sku);
      exactBySku.set(key, [...(exactBySku.get(key) || []), row]);
    }
  }

  let aliasTableMissing = false;
  const aliasProducts = async (key: string, customerId: string | null): Promise<string[]> => {
    if (aliasTableMissing) return [];
    let query = supabase
      .from("vyron_order_product_aliases")
      .select("product_id, customer_id, source_code_normalized")
      .eq("company_id", companyId)
      .eq("source_code_normalized", key)
      .is("revoked_at", null);
    query = customerId ? query.eq("customer_id", customerId) : query.is("customer_id", null);
    const { data, error } = await query;
    if (error) {
      if (isMissingRelation(error)) {
        aliasTableMissing = true;
        return [];
      }
      raiseDbError(error, "Alias lookup failed");
    }
    return [...new Set(((data || []) as Array<{ product_id: string }>).map((row) => String(row.product_id)))];
  };

  /** The accounting item-code mappings used by the invoice import. Absent table → no rung. */
  const itemMappingProducts = async (rawSku: string): Promise<string[]> => {
    const { data, error } = await supabase
      .from("vyron_customer_item_mappings")
      .select("source_item_code, product_id")
      .eq("company_id", companyId)
      .ilike("source_item_code", escapeLike(rawSku.trim()));
    if (error) {
      if (isMissingRelation(error)) return [];
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
  };

  const productsFor = async (ids: string[]) => {
    const found = await loadProductsById(supabase, companyId, ids);
    return ids.map((id) => found.get(id)).filter(Boolean) as ProductRecord[];
  };

  return {
    async match(line) {
      if (line.productId) {
        const [product] = await productsFor([line.productId]);
        if (!product) {
          return { status: "UNMATCHED", rule: null, product: null, candidates: [], reason: "The chosen product does not exist in this company." };
        }
        return { status: "MATCHED", rule: "manual", product, candidates: [toCandidate(product)], reason: "Chosen by a person." };
      }

      const externalId = String(line.externalProductId ?? "").trim();
      const system = String(options.catalogSystem ?? "").trim();
      if (externalId && system) {
        const linked = await productsFor(await linkedEntityIds(supabase, companyId, system, "product", externalId, ["product"]));
        const byExternal = decide("external_id", linked, `Linked to the source's product id ${externalId} (${system}).`);
        if (byExternal) return byExternal;
      }

      const key = aliasKeyFor(line);
      if (key && options.customerId) {
        const byCustomerAlias = decide("customer_alias", await productsFor(await aliasProducts(key, options.customerId)), "This customer's approved item code.");
        if (byCustomerAlias) return byCustomerAlias;
      }

      const rawSku = String(line.rawSku ?? "");
      if (rawSku.trim()) {
        const exact = decide("sku_exact", exactBySku.get(rawSku) || [], "Exact SKU match.");
        if (exact) return exact;

        const target = normalizeSku(rawSku);
        const normalized = (await productsWhere(supabase, companyId, "sku", "ilike", rawSku.trim())).filter((row) => normalizeSku(row.sku) === target);
        const byNormalized = decide("sku_normalized", uniqueById(normalized), "SKU match ignoring case and surrounding spaces.");
        if (byNormalized) return byNormalized;

        const aliasIds = [...new Set([...(await aliasProducts(key!, null)), ...(await itemMappingProducts(rawSku))])];
        const byAlias = decide("alias", await productsFor(aliasIds), "Approved item-code alias.");
        if (byAlias) return byAlias;

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
        const companyAlias = decide("alias", await productsFor(await aliasProducts(key!, null)), "Approved description alias.");
        if (companyAlias) return companyAlias;
        if (options.nameMatching === "off") {
          return {
            status: "UNMATCHED",
            rule: null,
            product: null,
            candidates: [],
            reason: "The line has no SKU, and product-name matching is switched off for this company.",
          };
        }
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
    },
  };
}

/** Match one line (convenience wrapper; the loader uses a shared matcher per order). */
export async function matchProductForLine(
  supabase: SupabaseClient,
  companyId: string,
  line: { productId?: string | null; rawSku?: string | null; rawDescription?: string | null },
  options: { customerId?: string | null } = {}
): Promise<ProductMatch> {
  const matcher = await createProductMatcher(supabase, companyId, { customerId: options.customerId, rawSkus: [line.rawSku] });
  return matcher.match(line);
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
 * Identify the customer: a person's choice · a remembered source reference ·
 * exact normalised name · sender e-mail (e-mail source only). More than one
 * candidate is AMBIGUOUS. Nothing is ever merged or created.
 */
export async function matchCustomer(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    customerId?: string | null;
    customerName?: string | null;
    senderEmail?: string | null;
    source?: string | null;
    customerReference?: string | null;
    externalCustomerId?: string | null;
    catalogSystem?: string | null;
  }
): Promise<CustomerMatch> {
  const toCandidates = (rows: CustomerRecord[]) => rows.map((row) => ({ id: row.id, name: row.customer_name ?? null }));

  if (input.customerId) {
    const rows = await customersWhere(supabase, companyId, "id", "eq", input.customerId);
    if (rows.length === 1) {
      return { status: "MATCHED", rule: "customer_id", customer: rows[0], candidates: toCandidates(rows), reason: "Chosen by a person." };
    }
    return { status: "UNMATCHED", rule: null, customer: null, candidates: [], reason: "The chosen customer does not exist in this company." };
  }

  const externalId = String(input.externalCustomerId ?? "").trim();
  const system = String(input.catalogSystem ?? "").trim();
  if (externalId && system) {
    const ids = await linkedEntityIds(supabase, companyId, system, "customer", externalId, ["customer"]);
    if (ids.length) {
      const rows = uniqueById((await Promise.all(ids.map((id) => customersWhere(supabase, companyId, "id", "eq", id)))).flat());
      if (rows.length === 1) {
        return { status: "MATCHED", rule: "external_id", customer: rows[0], candidates: toCandidates(rows), reason: `Linked to the source's customer id ${externalId} (${system}).` };
      }
      if (rows.length > 1) {
        return { status: "AMBIGUOUS", rule: null, customer: null, candidates: toCandidates(rows), reason: "The source customer id is linked to more than one customer." };
      }
    }
  }

  const reference = identityKeyFor(input.customerReference);
  if (reference && input.source) {
    const { data, error } = await supabase
      .from("vyron_order_customer_identities")
      .select("customer_id")
      .eq("company_id", companyId)
      .eq("source", input.source)
      .eq("external_reference_normalized", reference)
      .is("revoked_at", null);
    if (error && !isMissingRelation(error)) raiseDbError(error, "Customer identity lookup failed");
    const ids = [...new Set(((data || []) as Array<{ customer_id: string }>).map((row) => String(row.customer_id)))];
    if (ids.length) {
      const rows = uniqueById((await Promise.all(ids.map((id) => customersWhere(supabase, companyId, "id", "eq", id)))).flat());
      if (rows.length === 1) {
        return { status: "MATCHED", rule: "identity_map", customer: rows[0], candidates: toCandidates(rows), reason: "Remembered customer reference." };
      }
      if (rows.length > 1) {
        return { status: "AMBIGUOUS", rule: null, customer: null, candidates: toCandidates(rows), reason: "The customer reference is mapped to more than one customer." };
      }
    }
  }

  const name = String(input.customerName ?? "");
  if (name.trim()) {
    const target = normalizeName(name);
    const rows = uniqueById(
      (await customersWhere(supabase, companyId, "customer_name", "pattern", nameEqualityPattern(name))).filter((row) => normalizeName(row.customer_name) === target)
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
      [...byEmail, ...byInvoiceEmail].filter((row) => normalizeEmail(row.email) === email || normalizeEmail(row.invoice_email) === email)
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
