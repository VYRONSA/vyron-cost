import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportEntityType } from "@/lib/vyron-import-centre";
import { findOrCreateStockItem, postStockMovement, type StockEntityType } from "@/lib/vyron-inventory";
import { loadSupplierIndex, matchSupplierInIndex, resolveSupplier } from "@/lib/vyron-supplier-resolution";

/**
 * Import outcome.
 *
 * `imported`, `skipped` and `errors` are retained unchanged so every existing
 * caller — the `/api/workspace/admin/import` route and its UIs — continues to
 * work exactly as before. The per-outcome counters are additive.
 *
 * `imported` = inserted + updated, preserving its original meaning of
 * "rows that resulted in a write".
 */
export type ImportPersistResult = {
  imported: number;
  skipped: number;
  errors: string[];
  /** Rows that created a new record. */
  inserted?: number;
  /** Rows that updated an existing record. */
  updated?: number;
  /** Rows matching an existing record where nothing needed changing. */
  duplicate?: number;
  /** Rows deliberately not processed (blank key, unsupported). */
  skippedRows?: number;
  /** Rows that raised an error. */
  failed?: number;
  /** Possible duplicates requiring a human decision. Never auto-merged. */
  review?: {
    row: number;
    name: string;
    candidates: { id: string; supplierName: string; similarity: number }[];
  }[];
};

function entityTypeFromRow(value: string): StockEntityType {
  const normalized = value.toLowerCase();
  if (normalized.includes("finish") || normalized.includes("product")) return "finished_goods";
  if (normalized.includes("pack")) return "packaging";
  return "ingredient";
}

/**
 * Supplier import with deterministic duplicate protection.
 *
 * Every row is resolved through the shared Supplier Resolution Service BEFORE
 * any write. The previous implementation inserted unconditionally, so
 * re-importing a file duplicated every supplier in it.
 *
 * Matching hierarchy is owned by `@/lib/vyron-supplier-resolution`:
 *   VAT number -> exact name -> normalised name -> fuzzy (proposal only) -> create
 *
 * No AI is involved. Tier 4 never merges automatically: a fuzzy candidate is
 * reported for human decision and the row is inserted as new, because creating
 * a duplicate is recoverable and merging two real suppliers is not.
 */
async function persistSuppliers(
  supabase: SupabaseClient,
  companyId: string,
  rows: Record<string, string>[]
): Promise<ImportPersistResult> {
  const errors: string[] = [];
  const review: NonNullable<ImportPersistResult["review"]> = [];
  let inserted = 0;
  let updated = 0;
  let duplicate = 0;
  let skippedRows = 0;
  let failed = 0;

  const index = await loadSupplierIndex(supabase, companyId);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 2; // +1 for zero-index, +1 for the header line
    const name = row.supplier_name?.trim();

    if (!name) {
      errors.push(`Row ${rowNumber}: missing supplier_name`);
      skippedRows += 1;
      continue;
    }

    const input = {
      supplierName: name,
      vatNumber: row.vat_number || row.supplier_vat_number || null,
      contactEmail: row.contact_email || null,
      invoiceEmail: row.invoice_email || null,
      category: row.category || null,
      paymentTerms: row.payment_terms || row.terms || null,
      riskStatus: row.risk_status || null,
    };

    const match = matchSupplierInIndex(index, input);

    if (match.row) {
      // Existing supplier — apply only the fields the file actually supplies.
      const patch: Record<string, unknown> = {};
      if (row.category?.trim()) patch.category = row.category.trim();
      if (row.contact_email?.trim()) patch.contact_email = row.contact_email.trim();
      if (row.risk_status?.trim()) patch.risk_status = row.risk_status.trim();
      if (row.last_price_movement?.trim() && !Number.isNaN(Number(row.last_price_movement))) {
        patch.last_price_movement = Number(row.last_price_movement);
      }

      if (!Object.keys(patch).length) {
        duplicate += 1;
        continue;
      }

      const { error } = await supabase
        .from("vyron_cost_suppliers")
        .update(patch)
        .eq("id", match.row.id)
        .eq("company_id", companyId);

      if (error) {
        errors.push(`Row ${rowNumber} — ${name}: ${error.message}`);
        failed += 1;
      } else {
        updated += 1;
      }
      continue;
    }

    // No deterministic match. Record any fuzzy near-matches for human review,
    // then create — proposals never block an import and never auto-merge.
    if (match.candidates.length) {
      review.push({
        row: rowNumber,
        name,
        candidates: match.candidates.map((candidate) => ({
          id: candidate.id,
          supplierName: candidate.supplierName,
          similarity: candidate.similarity,
        })),
      });
    }

    const resolution = await resolveSupplier(supabase, companyId, input, { source: "import" }, index);

    if (resolution.outcome === "created") {
      if (row.last_price_movement?.trim() && !Number.isNaN(Number(row.last_price_movement))) {
        await supabase
          .from("vyron_cost_suppliers")
          .update({ last_price_movement: Number(row.last_price_movement) })
          .eq("id", resolution.supplierId as string)
          .eq("company_id", companyId);
      }
      inserted += 1;
    } else {
      errors.push(`Row ${rowNumber} — ${name}: ${resolution.error || "Could not create supplier."}`);
      failed += 1;
    }
  }

  return {
    imported: inserted + updated,
    skipped: duplicate + skippedRows + failed,
    errors,
    inserted,
    updated,
    duplicate,
    skippedRows,
    failed,
    review: review.length ? review : undefined,
  };
}

export async function persistImportRows(
  supabase: SupabaseClient,
  companyId: string,
  entity: ImportEntityType,
  rows: Record<string, string>[],
  actor = "Import Centre"
): Promise<ImportPersistResult> {
  if (entity === "opening-stock") {
    const result = await postOpeningStockBalances(supabase, companyId, rows, actor);
    return { imported: result.posted, skipped: result.skipped, errors: result.errors };
  }

  if (entity === "suppliers") {
    return persistSuppliers(supabase, companyId, rows);
  }

  if (entity === "ingredients") {
    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const name = row.ingredient_name?.trim();
      if (!name) {
        errors.push("Missing ingredient_name");
        continue;
      }
      const { error } = await supabase.from("vyron_cost_ingredients").insert({
        id: randomUUID(),
        company_id: companyId,
        ingredient_name: name,
        category: row.category || "Ingredient",
        purchase_unit: row.purchase_unit || "kg",
        recipe_unit: row.recipe_unit || row.purchase_unit || "kg",
        purchase_cost: Number(row.purchase_cost || 0),
        yield_percent: Number(row.yield_percent || 100),
      });
      if (error) errors.push(`${name}: ${error.message}`);
      else imported += 1;
    }
    return { imported, skipped: rows.length - imported, errors };
  }

  if (entity === "products" || entity === "finished-products") {
    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const name = (row.product_name || row.item_name || "").trim();
      if (!name) {
        errors.push("Missing product_name");
        continue;
      }
      const selling = Number(row.selling_price || 0);
      const cost = Number(row.total_cost || row.unit_cost || 0);
      const targetGp = Number(row.target_gp || 0);
      const actualGp = selling > 0 ? ((selling - cost) / selling) * 100 : 0;
      const { error } = await supabase.from("vyron_cost_products").insert({
        id: randomUUID(),
        company_id: companyId,
        product_name: name,
        category: row.category || "General",
        selling_price: selling,
        total_cost: cost,
        target_gp: targetGp,
        actual_gp: actualGp,
        status: row.status || "Active",
      });
      if (error) errors.push(`${name}: ${error.message}`);
      else imported += 1;
    }
    return { imported, skipped: rows.length - imported, errors };
  }

  if (entity === "customers") {
    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const name = (row.customer_name || row.name || "").trim();
      if (!name) {
        errors.push("Missing customer_name");
        continue;
      }
      const payload = {
        company_id: companyId,
        customer_name: name,
        category: row.category || "Customer",
        email: row.contact_email || row.invoice_email || null,
        invoice_email: row.invoice_email || row.contact_email || null,
        phone: row.phone || null,
        terms: row.terms || "30 Days",
        vat_number: row.vat_number || null,
        status: row.status || "Active",
        active: row.status !== "Inactive",
      };

      /**
       * Re-importing the same customer master must not create a second copy.
       * A customer is identified within its company by Xero contact id when the
       * row carries one, otherwise by case-insensitive customer_name. The lookup
       * is always scoped by company_id so company isolation is preserved.
       */
      const xeroId = (row.xero_contact_id || "").trim();
      let existingId: string | null = null;

      if (xeroId) {
        const { data: byXero } = await supabase
          .from("vyron_customers")
          .select("id")
          .eq("company_id", companyId)
          .eq("xero_contact_id", xeroId)
          .maybeSingle();
        if (byXero?.id) existingId = String(byXero.id);
      }

      if (!existingId) {
        const { data: byName } = await supabase
          .from("vyron_customers")
          .select("id")
          .eq("company_id", companyId)
          .ilike("customer_name", name)
          .limit(1);
        if (byName?.length) existingId = String(byName[0].id);
      }

      const { error } = existingId
        ? await supabase.from("vyron_customers").update(payload).eq("id", existingId)
        : await supabase.from("vyron_customers").insert({ id: randomUUID(), ...payload });

      if (error) errors.push(`${name}: ${error.message}`);
      else imported += 1;
    }
    return { imported, skipped: rows.length - imported, errors };
  }

  if (entity === "recipes") {
    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const name = row.recipe_name?.trim() || row.bom_name?.trim();
      if (!name) {
        errors.push("Missing recipe_name");
        continue;
      }
      const totalCost = Number(row.total_cost || 0);
      const yieldQty = Math.max(1, Number(row.yield_qty || 1));
      const { error } = await supabase.from("vyron_cost_boms").insert({
        id: randomUUID(),
        company_id: companyId,
        bom_name: name,
        category: row.category || "General",
        yield_qty: yieldQty,
        yield_unit: row.yield_unit || "unit",
        total_cost: totalCost,
        cost_per_unit: totalCost / yieldQty,
        target_gp: Number(row.target_gp || 0),
        selling_price: Number(row.selling_price || 0),
        status: row.status || "Draft",
      });
      if (error) errors.push(`${name}: ${error.message}`);
      else imported += 1;
    }
    return { imported, skipped: rows.length - imported, errors };
  }

  if (entity === "bom-lines") {
    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const recipeName = row.recipe_name?.trim() || row.bom_name?.trim();
      const lineName = row.ingredient_name?.trim() || row.line_name?.trim();
      if (!recipeName || !lineName) {
        errors.push("Missing recipe_name or line_name");
        continue;
      }
      const { data: bom } = await supabase
        .from("vyron_cost_boms")
        .select("id")
        .eq("company_id", companyId)
        .eq("bom_name", recipeName)
        .maybeSingle();
      if (!bom?.id) {
        errors.push(`${recipeName}: BOM not found in workspace`);
        continue;
      }
      const quantity = Number(row.quantity || 0);
      const unitCost = Number(row.unit_cost || 0);
      const wastage = Number(row.wastage_percent || 0);

      /**
       * line_cost is GENERATED ALWAYS in the database, so it must never appear
       * in the payload — Postgres rejects the whole row otherwise. This mirrors
       * insertRecipeLines() in vyron-cost-recipes-data.ts, the canonical
       * Recipe/BOM persistence contract, which also omits it.
       */
      const payload = {
        company_id: companyId,
        bom_id: bom.id,
        line_type: row.line_type || "Ingredient",
        line_name: lineName,
        quantity,
        unit: row.unit || "kg",
        unit_cost: unitCost,
        wastage_percent: wastage,
        sort_order: Number(row.sort_order || imported),
      };

      /**
       * A BOM line is identified within its company by its parent BOM and line
       * name, so re-importing the same file updates rather than duplicating.
       */
      const { data: existingLine } = await supabase
        .from("vyron_cost_bom_lines")
        .select("id")
        .eq("company_id", companyId)
        .eq("bom_id", bom.id)
        .ilike("line_name", lineName)
        .limit(1);

      const { error } = existingLine?.length
        ? await supabase.from("vyron_cost_bom_lines").update(payload).eq("id", existingLine[0].id)
        : await supabase.from("vyron_cost_bom_lines").insert({ id: randomUUID(), ...payload });

      if (error) errors.push(`${recipeName}/${lineName}: ${error.message}`);
      else imported += 1;
    }
    return { imported, skipped: rows.length - imported, errors };
  }

  if (entity === "product-mappings") {
    return persistProductMappings(supabase, companyId, rows);
  }

  if (entity === "customer-price-list-items") {
    return persistCustomerPriceListItems(supabase, companyId, rows);
  }

  if (entity === "customer-invoices") {
    return persistCustomerInvoices(supabase, companyId, rows);
  }

  if (entity === "supplier-invoices") {
    return persistSupplierInvoices(supabase, companyId, rows);
  }

  if (entity === "packaging") {
    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const name = row.item_name?.trim();
      if (!name) {
        errors.push("Missing item_name");
        continue;
      }
      const { error } = await supabase.from("vyron_cost_ingredients").insert({
        id: randomUUID(),
        company_id: companyId,
        ingredient_name: name,
        category: row.category || "Packaging",
        purchase_unit: row.purchase_unit || "each",
        recipe_unit: row.purchase_unit || "each",
        purchase_cost: Number(row.purchase_cost || 0),
        yield_percent: 100,
      });
      if (error) errors.push(`${name}: ${error.message}`);
      else imported += 1;
    }
    return { imported, skipped: rows.length - imported, errors };
  }

  throw new Error(`Import persistence not yet implemented for ${entity}.`);
}

export async function postOpeningStockBalances(
  supabase: SupabaseClient,
  companyId: string,
  rows: Record<string, string>[],
  actor = "Opening Stock Import"
) {
  let posted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const name = row.item_name?.trim();
    const qty = Number(row.qty_on_hand || 0);
    const unitCost = Number(row.unit_cost || 0);
    if (!name || qty <= 0) {
      skipped += 1;
      errors.push(`${name || "Row"}: invalid quantity`);
      continue;
    }

    try {
      const entityType = entityTypeFromRow(row.entity_type || "ingredient");
      const stockItem = await findOrCreateStockItem(supabase, companyId, {
        entityType,
        itemCode: `OB-${name.slice(0, 12).replace(/\s+/g, "-").toUpperCase()}`,
        description: name,
        category: row.category || entityType,
        unit: row.unit || "kg",
        currentCost: unitCost,
      });

      const { postOpeningStockMovement } = await import("@/lib/vyron-inventory");
      await postOpeningStockMovement(supabase, {
        companyId,
        stockItemId: stockItem.id,
        quantity: qty,
        unitCost,
        referenceNote: row.location || row.reference || "Opening balance",
        actor,
        movementDate: row.opening_date || row.date || undefined,
      });
      posted += 1;
    } catch (error) {
      skipped += 1;
      errors.push(`${name}: ${error instanceof Error ? error.message : "Failed"}`);
    }
  }

  return { posted, skipped, errors };
}

/* ------------------------------------------------------------------ *
 * Customer price lists, customer invoices and supplier invoices.
 * These write into the existing VYRON COST tables — no import-only
 * tables and no parallel systems. Every lookup is company scoped.
 * ------------------------------------------------------------------ */


/**
 * In-memory resolution index for accounting imports.
 *
 * Customer and product resolution used to issue up to four Supabase round-trips
 * per invoice line. On a real accounting file (578 lines) that is ~2,300
 * sequential queries, which never returns inside a serverless request. Every
 * lookup set is small enough to load once per request and resolve in memory.
 *
 * Resolution order is unchanged: saved mapping by item code, saved mapping by
 * description, product SKU, then exact product name.
 */
type ResolvedProduct = { id: string; product_name: string; total_cost: number };

export type ImportResolutionIndex = {
  customersByName: Map<string, { id: string; customer_name: string }>;
  productsById: Map<string, ResolvedProduct>;
  productsByName: Map<string, ResolvedProduct>;
  productsBySku: Map<string, ResolvedProduct>;
  mappingByCode: Map<string, string>;
  mappingByDescription: Map<string, string>;
};

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();

async function loadAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  companyId: string
): Promise<T[]> {
  const out: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("company_id", companyId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data || []) as T[];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

export async function loadImportResolutionIndex(
  supabase: SupabaseClient,
  companyId: string
): Promise<ImportResolutionIndex> {
  const [customers, products, mappings] = await Promise.all([
    loadAll<{ id: string; customer_name: string }>(
      supabase,
      "vyron_customers",
      "id, customer_name",
      companyId
    ),
    loadAll<{ id: string; product_name: string; sku: string | null; total_cost: number | null }>(
      supabase,
      "vyron_cost_products",
      "id, product_name, sku, total_cost",
      companyId
    ),
    loadAll<{ source_item_code: string | null; source_description: string | null; product_id: string }>(
      supabase,
      "vyron_customer_item_mappings",
      "source_item_code, source_description, product_id",
      companyId
    ),
  ]);

  const index: ImportResolutionIndex = {
    customersByName: new Map(),
    productsById: new Map(),
    productsByName: new Map(),
    productsBySku: new Map(),
    mappingByCode: new Map(),
    mappingByDescription: new Map(),
  };

  for (const customer of customers) {
    const key = norm(customer.customer_name);
    if (key && !index.customersByName.has(key)) index.customersByName.set(key, customer);
  }

  for (const product of products) {
    const entry: ResolvedProduct = {
      id: String(product.id),
      product_name: product.product_name,
      total_cost: Number(product.total_cost || 0),
    };
    index.productsById.set(entry.id, entry);
    const nameKey = norm(product.product_name);
    if (nameKey && !index.productsByName.has(nameKey)) index.productsByName.set(nameKey, entry);
    const skuKey = norm(product.sku);
    if (skuKey && !index.productsBySku.has(skuKey)) index.productsBySku.set(skuKey, entry);
  }

  for (const mapping of mappings) {
    const codeKey = norm(mapping.source_item_code);
    if (codeKey && !index.mappingByCode.has(codeKey)) {
      index.mappingByCode.set(codeKey, String(mapping.product_id));
    }
    const descKey = norm(mapping.source_description);
    if (descKey && !index.mappingByDescription.has(descKey)) {
      index.mappingByDescription.set(descKey, String(mapping.product_id));
    }
  }

  return index;
}

/** Company-scoped customer lookup against the preloaded index. Never creates. */
function resolveCustomer(index: ImportResolutionIndex, name: string) {
  return index.customersByName.get(norm(name)) || null;
}

/**
 * Product resolution against the preloaded index, preserving the approved
 * order: saved mapping by code, saved mapping by description, SKU, exact name.
 */
function resolveProduct(
  index: ImportResolutionIndex,
  code: string | null,
  name: string | null
): ResolvedProduct | null {
  const codeKey = norm(code);
  const nameKey = norm(name);

  if (codeKey) {
    const mapped = index.mappingByCode.get(codeKey);
    if (mapped) {
      const product = index.productsById.get(mapped);
      if (product) return product;
    }
  }

  if (nameKey) {
    const mapped = index.mappingByDescription.get(nameKey);
    if (mapped) {
      const product = index.productsById.get(mapped);
      if (product) return product;
    }
  }

  for (const key of [codeKey, nameKey]) {
    if (!key) continue;
    const bySku = index.productsBySku.get(key);
    if (bySku) return bySku;
    const byName = index.productsByName.get(key);
    if (byName) return byName;
  }

  return null;
}

/** Existing invoice numbers for this company, fetched in one batched query. */
async function loadExistingCustomerInvoices(
  supabase: SupabaseClient,
  companyId: string,
  invoiceNumbers: string[]
) {
  const found = new Map<string, { id: string; stock_posted: boolean }>();
  const chunkSize = 200;
  for (let i = 0; i < invoiceNumbers.length; i += chunkSize) {
    const chunk = invoiceNumbers.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from("vyron_customer_invoices")
      .select("id, invoice_number, stock_posted")
      .eq("company_id", companyId)
      .in("invoice_number", chunk);
    if (error) throw new Error(`vyron_customer_invoices: ${error.message}`);
    for (const row of data || []) {
      found.set(String(row.invoice_number), {
        id: String(row.id),
        stock_posted: Boolean(row.stock_posted),
      });
    }
  }
  return found;
}

/** Case-insensitive, company-scoped customer lookup. Never creates a customer. */
async function findCustomerByName(supabase: SupabaseClient, companyId: string, name: string) {
  const { data } = await supabase
    .from("vyron_customers")
    .select("id, customer_name")
    .eq("company_id", companyId)
    .ilike("customer_name", name)
    .limit(1);
  return data?.length ? data[0] : null;
}

/**
 * Company-scoped product resolution for accounting imports.
 *
 * Order: saved accounting-item mapping (by code, then description) -> product
 * SKU -> exact product name. The mapping table is consulted first so that once
 * an operator maps an accounting item code to a VYRON product, every future
 * import resolves it automatically without re-mapping.
 *
 * Never creates a product.
 */
async function findProductForImport(
  supabase: SupabaseClient,
  companyId: string,
  code: string | null,
  name: string | null
) {
  const loadProduct = async (productId: string) => {
    const { data } = await supabase
      .from("vyron_cost_products")
      .select("id, product_name")
      .eq("company_id", companyId)
      .eq("id", productId)
      .maybeSingle();
    return data || null;
  };

  // 1. Saved mapping by accounting item code.
  if (code) {
    const { data } = await supabase
      .from("vyron_customer_item_mappings")
      .select("product_id")
      .eq("company_id", companyId)
      .eq("source_item_code", code)
      .limit(1);
    if (data?.length) {
      const product = await loadProduct(String(data[0].product_id));
      if (product) return product;
    }
  }

  // 2. Saved mapping by accounting description (covers rows with no item code).
  if (name) {
    const { data } = await supabase
      .from("vyron_customer_item_mappings")
      .select("product_id")
      .eq("company_id", companyId)
      .ilike("source_description", name)
      .limit(1);
    if (data?.length) {
      const product = await loadProduct(String(data[0].product_id));
      if (product) return product;
    }
  }

  // 3. Product SKU, then 4. exact product name.
  for (const candidate of [code, name]) {
    if (!candidate) continue;
    const bySku = await supabase
      .from("vyron_cost_products")
      .select("id, product_name")
      .eq("company_id", companyId)
      .ilike("sku", candidate)
      .limit(1);
    if (bySku.data?.length) return bySku.data[0];

    const byName = await supabase
      .from("vyron_cost_products")
      .select("id, product_name")
      .eq("company_id", companyId)
      .ilike("product_name", candidate)
      .limit(1);
    if (byName.data?.length) return byName.data[0];
  }

  return null;
}

/** Accepts the accounting export dd/mm/yyyy form as well as ISO. */
function parseImportDate(value: string | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

/**
 * Customer price lists delegate to the existing engine in
 * vyron-customer-price-lists.ts. There is exactly one price-list importer;
 * this adapter only maps Import Centre CSV columns onto PriceImportRow.
 */
async function persistCustomerPriceListItems(
  supabase: SupabaseClient,
  companyId: string,
  rows: Record<string, string>[],
  fileName = "customer-price-lists.csv"
): Promise<ImportPersistResult> {
  const { importCustomerPriceListRows } = await import("@/lib/vyron-customer-price-lists");

  const mapped = rows.map((row) => ({
    listName: (row.price_list_name || "").trim(),
    listType: (row.list_type || "Standard").trim() as "Standard" | "Contract",
    customerCode: row.customer_code || undefined,
    customerName: row.customer_name || undefined,
    productCode: (row.product_code || "").trim(),
    productName: (row.product_name || "").trim(),
    basePrice: row.base_price ? Number(row.base_price) : undefined,
    overridePrice: row.final_price ? Number(row.final_price) : undefined,
    effectiveFrom: row.effective_from || undefined,
    effectiveTo: row.effective_to || undefined,
    status: (row.status || "Active").trim() as "Active" | "Inactive",
  }));

  const result = await importCustomerPriceListRows(supabase, companyId, {
    fileName,
    rows: mapped,
    actor: "Import Centre",
  });

  const raw = result as Record<string, unknown>;
  const imported = Number(raw.imported ?? raw.applied ?? raw.processed ?? 0);
  const skipped = Number(raw.skipped ?? 0);
  /**
   * The price-list engine reports errors as { row, error } objects. Stringifying
   * them directly rendered "[object Object]" in the Import Centre, so format
   * them into the row-prefixed messages the UI already expects.
   */
  const errors = Array.isArray(raw.errors)
    ? (raw.errors as unknown[]).map((entry) => {
        if (entry && typeof entry === "object") {
          const item = entry as { row?: unknown; error?: unknown };
          const message = String(item.error ?? "Import error.");
          const rowNumber = Number(item.row ?? 0);
          return rowNumber > 0 ? `Row ${rowNumber}: ${message}` : message;
        }
        return String(entry);
      })
    : [];

  const rejected = Number(raw.rejected ?? 0);

  return { imported, skipped: skipped || rejected, errors };
}

/**
 * The accounting export uses its own status vocabulary. vyron_customer_invoices
 * constrains status to Draft/Approved/Posted/Sent/Paid/Cancelled, so map onto
 * those rather than widening the constraint. Unknown values fall back to Draft,
 * the safest non-destructive state.
 */
function mapImportedInvoiceStatus(
  raw: string | undefined,
  amountDue: number,
  amountPaid: number
): string | null {
  const value = (raw || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "draft") return "Draft";
  if (value === "voided" || value === "deleted" || value === "cancelled") return "Cancelled";
  if (value === "paid" || (amountPaid > 0 && amountDue <= 0)) return "Paid";
  if (value === "awaiting payment" || value === "sent" || value === "submitted") return "Sent";
  if (value === "approved" || value === "authorised" || value === "authorized") return "Approved";
  if (value === "posted") return "Posted";
  // Unsupported status is never guessed — the caller blocks the invoice.
  return null;
}

async function persistCustomerInvoices(
  supabase: SupabaseClient,
  companyId: string,
  rows: Record<string, string>[]
): Promise<ImportPersistResult> {
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  let skippedRows = 0;

  /**
   * A CSV row is an invoice LINE, and many rows share one InvoiceNumber.
   * Group first so one invoice with N lines never becomes N invoices.
   */
  const index = await loadImportResolutionIndex(supabase, companyId);
  const groups = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const number = (row.invoice_number || row.InvoiceNumber || "").trim();
    if (!number) {
      skippedRows += 1;
      continue;
    }
    const bucket = groups.get(number) || [];
    bucket.push(row);
    groups.set(number, bucket);
  }

  for (const [invoiceNumber, lineRows] of groups) {
    const head = lineRows[0];
    const customerName = (head.customer_name || head.ContactName || "").trim();
    if (!customerName) {
      errors.push(`${invoiceNumber}: missing ContactName`);
      failed += 1;
      continue;
    }

    const customer = resolveCustomer(index, customerName);
    if (!customer) {
      errors.push(`${invoiceNumber}: customer "${customerName}" not found in this company — invoice not imported`);
      failed += 1;
      continue;
    }

    const resolvedLines: {
      product_id: string | null;
      product_name: string;
      quantity: number;
      selling_price: number;
      cost_per_unit: number;
    }[] = [];

    /**
     * An invoice is atomic. If any line cannot be resolved to a product, the
     * whole invoice is blocked — never import a partial invoice, and never
     * silently drop a line, because that would understate sales and GP.
     */
    const unresolved: string[] = [];

    for (const line of lineRows) {
      const description = (line.item_description || line.Description || line.description || "").trim();
      const code = (line.item_code || line.InventoryItemCode || line.product_code || "").trim() || null;
      if (!description && !code) {
        unresolved.push("line with no item code or description");
        continue;
      }

      const product = resolveProduct(index, code, description);
      if (!product) {
        unresolved.push(code || description);
      }

      const quantity = Number(line.quantity || line.Quantity || 0);
      const lineAmount = Number(line.line_total || line.LineAmount || line.line_amount || 0);
      const unitAmount = Number(
        line.unit_price || line.UnitAmount || line.unit_amount || (quantity ? lineAmount / quantity : 0)
      );

      resolvedLines.push({
        product_id: product?.id ? String(product.id) : null,
        product_name: description || String(product?.product_name || code || "Line"),
        quantity,
        selling_price: unitAmount,
        // Cost comes from the mapped VYRON product, so imported invoices carry
        // real cost and GP rather than reporting 100% margin.
        cost_per_unit: product ? product.total_cost : 0,
      });
    }

    if (!resolvedLines.length) {
      errors.push(`${invoiceNumber}: no usable invoice lines`);
      failed += 1;
      continue;
    }

    if (unresolved.length) {
      const unique = [...new Set(unresolved)];
      errors.push(
        `${invoiceNumber}: blocked — ${unique.length} unresolved item(s): ${unique.join(", ")}. Map them under Product Mapping, then re-run.`
      );
      failed += 1;
      continue;
    }

    const salesValue = resolvedLines.reduce((sum, l) => sum + l.quantity * l.selling_price, 0);
    const costValue = resolvedLines.reduce((sum, l) => sum + l.quantity * l.cost_per_unit, 0);
    const grossProfit = salesValue - costValue;

    /**
     * The accounting export repeats invoice-level figures on every line, so the
     * header row carries them. These are retained verbatim rather than derived,
     * so the imported invoice keeps the accounting system's own VAT, paid and
     * outstanding amounts.
     */
    const taxTotal = Number(head.tax_total || head.TaxTotal || 0);
    const amountPaid = Number(head.amount_paid || head.InvoiceAmountPaid || 0);
    const amountDue = Number(head.amount_due || head.InvoiceAmountDue || 0);

    const mappedStatus = mapImportedInvoiceStatus(head.status || head.Status, amountDue, amountPaid);
    if (!mappedStatus) {
      errors.push(
        `${invoiceNumber}: unsupported status "${(head.status || head.Status || "").trim()}" — invoice blocked. Use one of Draft, Approved, Posted, Sent, Paid, Cancelled.`
      );
      failed += 1;
      continue;
    }

    const invoicePayload = {
      company_id: companyId,
      customer_id: customer.id,
      customer_name: customer.customer_name,
      invoice_number: invoiceNumber,
      invoice_date:
        parseImportDate(head.invoice_date || head.InvoiceDate) || new Date().toISOString().slice(0, 10),
      due_date: parseImportDate(head.due_date || head.DueDate),
      status: mappedStatus,
      tax_total: taxTotal,
      amount_paid: amountPaid,
      amount_due: amountDue,
      sales_value: salesValue,
      cost_value: costValue,
      gross_profit: grossProfit,
      gp_percentage: salesValue ? (grossProfit / salesValue) * 100 : 0,
    };

    /**
     * Idempotency key: invoice_number within the company. Re-importing updates
     * the existing invoice and replaces its lines instead of duplicating it.
     */
    const { data: existingInvoice } = await supabase
      .from("vyron_customer_invoices")
      .select("id, stock_posted")
      .eq("company_id", companyId)
      .eq("invoice_number", invoiceNumber)
      .limit(1);

    let invoiceId: string;

    if (existingInvoice?.length) {
      if (existingInvoice[0].stock_posted) {
        errors.push(`${invoiceNumber}: already posted to stock — left unchanged`);
        skippedRows += 1;
        continue;
      }
      invoiceId = String(existingInvoice[0].id);
      const { error } = await supabase
        .from("vyron_customer_invoices")
        .update({ ...invoicePayload, updated_at: new Date().toISOString() })
        .eq("id", invoiceId);
      if (error) {
        errors.push(`${invoiceNumber}: ${error.message}`);
        failed += 1;
        continue;
      }
      await supabase.from("vyron_customer_invoice_lines").delete().eq("invoice_id", invoiceId);
      updated += 1;
    } else {
      invoiceId = randomUUID();
      const { error } = await supabase
        .from("vyron_customer_invoices")
        .insert({ id: invoiceId, ...invoicePayload });
      if (error) {
        errors.push(`${invoiceNumber}: ${error.message}`);
        failed += 1;
        continue;
      }
      inserted += 1;
    }

    // line_total, line_cost and line_gp are GENERATED ALWAYS — never supplied.
    const { error: linesError } = await supabase
      .from("vyron_customer_invoice_lines")
      .insert(resolvedLines.map((line) => ({ id: randomUUID(), invoice_id: invoiceId, ...line })));
    if (linesError) errors.push(`${invoiceNumber}: lines failed — ${linesError.message}`);
  }

  return {
    imported: inserted + updated,
    skipped: groups.size - (inserted + updated),
    errors,
    inserted,
    updated,
    skippedRows,
    failed,
  };
}

async function persistSupplierInvoices(
  supabase: SupabaseClient,
  companyId: string,
  rows: Record<string, string>[]
): Promise<ImportPersistResult> {
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  let skippedRows = 0;

  const groups = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const number = (row.invoice_number || row.InvoiceNumber || "").trim();
    if (!number) {
      skippedRows += 1;
      continue;
    }
    const bucket = groups.get(number) || [];
    bucket.push(row);
    groups.set(number, bucket);
  }

  const { data: companySuppliers } = await supabase
    .from("vyron_cost_suppliers")
    .select("id")
    .eq("company_id", companyId);
  const supplierIds = (companySuppliers || []).map((s) => String(s.id));

  for (const [invoiceNumber, lineRows] of groups) {
    const head = lineRows[0];
    const supplierName = (head.supplier_name || head.SupplierName || "").trim();
    if (!supplierName) {
      errors.push(`${invoiceNumber}: missing supplier_name`);
      failed += 1;
      continue;
    }

    const { data: supplierMatch } = await supabase
      .from("vyron_cost_suppliers")
      .select("id, supplier_name")
      .eq("company_id", companyId)
      .ilike("supplier_name", supplierName)
      .limit(1);

    if (!supplierMatch?.length) {
      errors.push(`${invoiceNumber}: supplier "${supplierName}" not found in this company — invoice not imported`);
      failed += 1;
      continue;
    }
    const supplier = supplierMatch[0];

    const lines = lineRows
      .map((line) => {
        const itemName = (line.item_description || line.item_name || line.description || "").trim();
        if (!itemName) return null;
        return {
          item_name: itemName,
          category: line.category || null,
          quantity: Number(line.quantity || 0),
          unit: line.unit || "each",
          unit_cost: Number(line.unit_price || line.unit_cost || 0),
          vat_rate: Number(line.vat_rate || 0),
        };
      })
      .filter((line): line is NonNullable<typeof line> => Boolean(line));

    if (!lines.length) {
      errors.push(`${invoiceNumber}: no usable invoice lines`);
      failed += 1;
      continue;
    }

    /**
     * The standard template carries invoice totals on the header and line VAT
     * per line. Prefer the accounting system's own figures; fall back to line
     * VAT, then to a per-line vat_rate, and only then to a derived subtotal.
     */
    const derivedSubtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_cost, 0);
    const lineVatTotal = lineRows.reduce((sum, line) => sum + Number(line.line_vat || 0), 0);
    const rateVatTotal = lines.reduce(
      (sum, l) => sum + l.quantity * l.unit_cost * (l.vat_rate / 100),
      0
    );

    const headerSubtotal = Number(head.subtotal || 0);
    const headerVat = Number(head.vat || 0);
    const headerTotal = Number(head.total || 0);

    const subtotal = headerSubtotal > 0 ? headerSubtotal : derivedSubtotal;
    const vat = headerVat > 0 ? headerVat : lineVatTotal > 0 ? lineVatTotal : rateVatTotal;
    const total = headerTotal > 0 ? headerTotal : subtotal + vat;

    const invoicePayload = {
      invoice_number: invoiceNumber,
      supplier_id: supplier.id,
      supplier_name: supplier.supplier_name,
      invoice_date: parseImportDate(head.invoice_date) || new Date().toISOString().slice(0, 10),
      status: head.status || "Captured",
      source_type: "import",
      subtotal,
      vat,
      total,
    };

    /**
     * vyron_cost_supplier_invoices carries no company_id, so company scope is
     * enforced through supplier_id — the idempotency lookup is restricted to
     * suppliers belonging to this company.
     */
    const { data: existingInvoice } = await supabase
      .from("vyron_cost_supplier_invoices")
      .select("id")
      .ilike("invoice_number", invoiceNumber)
      .in("supplier_id", supplierIds.length ? supplierIds : [randomUUID()])
      .limit(1);

    let invoiceId: string;

    if (existingInvoice?.length) {
      invoiceId = String(existingInvoice[0].id);
      const { error } = await supabase
        .from("vyron_cost_supplier_invoices")
        .update({ ...invoicePayload, updated_at: new Date().toISOString() })
        .eq("id", invoiceId);
      if (error) {
        errors.push(`${invoiceNumber}: ${error.message}`);
        failed += 1;
        continue;
      }
      await supabase.from("vyron_cost_supplier_invoice_lines").delete().eq("invoice_id", invoiceId);
      updated += 1;
    } else {
      invoiceId = randomUUID();
      const { error } = await supabase
        .from("vyron_cost_supplier_invoices")
        .insert({ id: invoiceId, ...invoicePayload });
      if (error) {
        errors.push(`${invoiceNumber}: ${error.message}`);
        failed += 1;
        continue;
      }
      inserted += 1;
    }

    // line_excl, line_vat and line_total are database-derived — never supplied.
    const { error: linesError } = await supabase
      .from("vyron_cost_supplier_invoice_lines")
      .insert(lines.map((line, index) => ({ id: randomUUID(), invoice_id: invoiceId, ...line, sort_order: index })));
    if (linesError) errors.push(`${invoiceNumber}: lines failed — ${linesError.message}`);
  }

  return {
    imported: inserted + updated,
    skipped: groups.size - (inserted + updated),
    errors,
    inserted,
    updated,
    skippedRows,
    failed,
  };
}

export type CustomerInvoicePreview = {
  invoicesDetected: number;
  linesDetected: number;
  customersMatched: number;
  customersUnresolved: string[];
  productsMapped: number;
  productsUnresolved: string[];
  missingItemCodeLines: number;
  invoicesEligible: number;
  invoicesBlocked: number;
  insertCount: number;
  updateCount: number;
  totalSales: number;
  totalVat: number;
  totalPaid: number;
  totalOutstanding: number;
  warnings: string[];
  errors: string[];
};

/**
 * Server-side dry run for the customer invoice import.
 *
 * Performs every resolution step the real import performs and writes NOTHING.
 * The operator reviews this before choosing to import, so an invoice that would
 * be blocked is reported here rather than discovered afterwards.
 */
export async function previewCustomerInvoices(
  supabase: SupabaseClient,
  companyId: string,
  rows: Record<string, string>[]
): Promise<CustomerInvoicePreview> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const index = await loadImportResolutionIndex(supabase, companyId);
  const groups = new Map<string, Record<string, string>[]>();
  let rowsWithoutInvoiceNumber = 0;
  for (const row of rows) {
    const number = (row.invoice_number || row.InvoiceNumber || "").trim();
    if (!number) {
      rowsWithoutInvoiceNumber += 1;
      continue;
    }
    const bucket = groups.get(number) || [];
    bucket.push(row);
    groups.set(number, bucket);
  }
  if (rowsWithoutInvoiceNumber) {
    warnings.push(`${rowsWithoutInvoiceNumber} row(s) have no InvoiceNumber and will be ignored.`);
  }

  // One batched lookup for every invoice number, instead of one query per invoice.
  const existingInvoices = await loadExistingCustomerInvoices(supabase, companyId, [...groups.keys()]);

  const customersUnresolved = new Set<string>();
  const productsUnresolved = new Set<string>();
  const customerCache = new Map<string, boolean>();
  const productCache = new Map<string, boolean>();

  let linesDetected = 0;
  let missingItemCodeLines = 0;
  let productsMapped = 0;
  let invoicesEligible = 0;
  let invoicesBlocked = 0;
  let insertCount = 0;
  let updateCount = 0;
  let totalSales = 0;
  let totalVat = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  const matchedCustomers = new Set<string>();

  for (const [invoiceNumber, lineRows] of groups) {
    const head = lineRows[0];
    linesDetected += lineRows.length;

    const customerName = (head.customer_name || head.ContactName || "").trim();
    let customerOk = false;
    if (!customerName) {
      errors.push(`${invoiceNumber}: missing ContactName.`);
    } else {
      if (!customerCache.has(customerName)) {
        const found = resolveCustomer(index, customerName);
        customerCache.set(customerName, Boolean(found));
      }
      customerOk = customerCache.get(customerName) === true;
      if (customerOk) matchedCustomers.add(customerName);
      else customersUnresolved.add(customerName);
    }

    let allLinesResolved = true;
    for (const line of lineRows) {
      const description = (line.item_description || line.Description || line.description || "").trim();
      const code = (line.item_code || line.InventoryItemCode || line.product_code || "").trim();
      if (!code) missingItemCodeLines += 1;

      if (!description && !code) {
        allLinesResolved = false;
        productsUnresolved.add("(line with no item code or description)");
        continue;
      }

      const cacheKey = `${code}||${description}`;
      if (!productCache.has(cacheKey)) {
        const product = resolveProduct(index, code || null, description || null);
        productCache.set(cacheKey, Boolean(product));
      }
      if (productCache.get(cacheKey)) {
        productsMapped += 1;
      } else {
        allLinesResolved = false;
        productsUnresolved.add(code || description);
      }
    }

    const salesValue = lineRows.reduce((sum, line) => {
      const quantity = Number(line.quantity || line.Quantity || 0);
      const lineAmount = Number(line.line_total || line.LineAmount || line.line_amount || 0);
      const unitAmount = Number(
        line.unit_price || line.UnitAmount || line.unit_amount || (quantity ? lineAmount / quantity : 0)
      );
      return sum + quantity * unitAmount;
    }, 0);

    totalSales += salesValue;
    totalVat += Number(head.tax_total || head.TaxTotal || 0);
    totalPaid += Number(head.amount_paid || head.InvoiceAmountPaid || 0);
    totalOutstanding += Number(head.amount_due || head.InvoiceAmountDue || 0);

    const statusOk =
      mapImportedInvoiceStatus(
        head.status || head.Status,
        Number(head.amount_due || head.InvoiceAmountDue || 0),
        Number(head.amount_paid || head.InvoiceAmountPaid || 0)
      ) !== null;
    if (!statusOk) {
      errors.push(
        `${invoiceNumber}: unsupported status "${(head.status || head.Status || "").trim()}" — invoice blocked.`
      );
    }

    const eligible = customerOk && allLinesResolved && statusOk;
    if (eligible) {
      invoicesEligible += 1;
      const existing = existingInvoices.get(invoiceNumber);
      if (existing) {
        if (existing.stock_posted) {
          warnings.push(`${invoiceNumber}: already posted to stock — it will be left unchanged.`);
        } else {
          updateCount += 1;
        }
      } else {
        insertCount += 1;
      }
    } else {
      invoicesBlocked += 1;
    }
  }

  if (customersUnresolved.size) {
    errors.push(`${customersUnresolved.size} unresolved customer(s) — those invoices are blocked.`);
  }
  if (productsUnresolved.size) {
    errors.push(
      `${productsUnresolved.size} unresolved accounting item(s) — map them under Product Mapping, then preview again.`
    );
  }

  return {
    invoicesDetected: groups.size,
    linesDetected,
    customersMatched: matchedCustomers.size,
    customersUnresolved: [...customersUnresolved],
    productsMapped,
    productsUnresolved: [...productsUnresolved],
    missingItemCodeLines,
    invoicesEligible,
    invoicesBlocked,
    insertCount,
    updateCount,
    totalSales,
    totalVat,
    totalPaid,
    totalOutstanding,
    warnings,
    errors,
  };
}

/**
 * Single implementation of the accounting-item -> VYRON product mapping write.
 *
 * Used by both the Product Mapping panel API and the Product Mapping CSV import
 * so there is exactly one set of rules: company scoped, idempotent on
 * (company_id, source_item_code), and never creates a product.
 */
export async function upsertCustomerItemMapping(
  supabase: SupabaseClient,
  companyId: string,
  input: { sourceItemCode?: string | null; sourceDescription?: string | null; productId: string }
): Promise<{ outcome: "inserted" | "updated" }> {
  const code = String(input.sourceItemCode || "").trim();
  const description = String(input.sourceDescription || "").trim();
  const productId = String(input.productId || "").trim();

  if (!code && !description) throw new Error("sourceItemCode or sourceDescription is required.");
  if (!productId) throw new Error("productId is required.");

  // The target must already exist in THIS company. Never create a product.
  const { data: product } = await supabase
    .from("vyron_cost_products")
    .select("id")
    .eq("company_id", companyId)
    .eq("id", productId)
    .maybeSingle();
  if (!product) throw new Error("Product not found in the active company.");

  const payload = {
    company_id: companyId,
    source_item_code: code || null,
    source_description: description || null,
    product_id: productId,
    updated_at: new Date().toISOString(),
  };

  const base = supabase
    .from("vyron_customer_item_mappings")
    .select("id")
    .eq("company_id", companyId)
    .limit(1);
  const { data: existing } = code
    ? await base.eq("source_item_code", code)
    : await base.ilike("source_description", description);

  if (existing?.length) {
    const { error } = await supabase
      .from("vyron_customer_item_mappings")
      .update(payload)
      .eq("id", existing[0].id);
    if (error) throw new Error(error.message);
    return { outcome: "updated" };
  }

  const { error } = await supabase.from("vyron_customer_item_mappings").insert(payload);
  if (error) throw new Error(error.message);
  return { outcome: "inserted" };
}

/**
 * Product Mapping CSV import. Accepts product_id, or product_name for an exact
 * company-scoped match. No fuzzy matching, and no product is ever created.
 */
async function persistProductMappings(
  supabase: SupabaseClient,
  companyId: string,
  rows: Record<string, string>[]
): Promise<ImportPersistResult> {
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  let skippedRows = 0;

  const index = await loadImportResolutionIndex(supabase, companyId);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 2;
    const code = (row.source_item_code || "").trim();
    const description = (row.source_description || "").trim();
    const explicitProductId = (row.product_id || "").trim();
    const productName = (row.product_name || "").trim();

    if (!code && !description) {
      errors.push(`Row ${rowNumber}: source_item_code or source_description is required.`);
      skippedRows += 1;
      continue;
    }

    let productId = explicitProductId;
    if (!productId) {
      if (!productName) {
        errors.push(`Row ${rowNumber}: provide product_id or product_name.`);
        failed += 1;
        continue;
      }
      const product = index.productsByName.get(productName.trim().toLowerCase());
      if (!product) {
        errors.push(`Row ${rowNumber}: product "${productName}" not found in this company.`);
        failed += 1;
        continue;
      }
      productId = product.id;
    }

    try {
      const result = await upsertCustomerItemMapping(supabase, companyId, {
        sourceItemCode: code,
        sourceDescription: description,
        productId,
      });
      if (result.outcome === "inserted") inserted += 1;
      else updated += 1;
    } catch (error) {
      errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : "Mapping failed."}`);
      failed += 1;
    }
  }

  return {
    imported: inserted + updated,
    skipped: skippedRows + failed,
    errors,
    inserted,
    updated,
    skippedRows,
    failed,
  };
}
