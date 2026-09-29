import type { SupabaseClient } from "@supabase/supabase-js";

export type CustomerPriceListRow = {
  id: string;
  company_id: string;
  list_name: string;
  list_type: "Standard" | "Contract";
  status: "Active" | "Inactive";
  effective_from: string | null;
  effective_to: string | null;
  version: number;
  notes: string | null;
};

export type CustomerPriceListItemRow = {
  id: string;
  company_id: string;
  price_list_id: string;
  product_id: string;
  base_price: number;
  markup_pct: number;
  discount_pct: number;
  gp_pct: number;
  override_price: number | null;
  final_price: number;
  status: "Active" | "Inactive";
  effective_from: string | null;
  effective_to: string | null;
};

/**
 * How a customer may be priced when their own list does not cover a product.
 * Stored per customer on the price-list assignment, and defaulting to the
 * historical behaviour so no existing customer's pricing changes.
 */
export const PRICE_SOURCE_RULES = ["fallback_to_master", "assigned_list_only"] as const;
export type PriceSourceRule = (typeof PRICE_SOURCE_RULES)[number];

/** True when this customer may only be priced by their assigned list. */
export function assignedListOnly(assignment: { price_source_rule?: string | null; contract_price_list_id?: string | null; default_price_list_id?: string | null } | null | undefined): boolean {
  if (!assignment) return false;
  if (String(assignment.price_source_rule || "fallback_to_master") !== "assigned_list_only") return false;
  // A rule with no list behind it would price nothing at all; that is a
  // configuration mistake, not an instruction to sell nothing.
  return Boolean(assignment.contract_price_list_id || assignment.default_price_list_id);
}

export type ResolvedCustomerPrice = {
  /** "unavailable": the customer's own list does not cover this product and may not be departed from. */
  source: "contract" | "default" | "product_master" | "unavailable";
  priceListId: string | null;
  sellingPrice: number;
  costPerUnit: number;
  productId: string;
  productName: string;
};

export type PriceImportRow = {
  listName: string;
  listType?: "Standard" | "Contract";
  customerCode?: string;
  customerName?: string;
  productCode: string;
  productName: string;
  basePrice?: number;
  markupPct?: number;
  discountPct?: number;
  gpPct?: number;
  overridePrice?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  status?: "Active" | "Inactive";
};

/** A refusal with the HTTP status the route should answer with. */
export class PriceListError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PriceListError";
    this.status = status;
  }
}

/*
 * The shape Postgres's uuid type accepts. An id that is not this shape can never
 * name a row, so it is answered "not found" before any query — sending it to the
 * database made Postgres reject the cast and the route answer 500. Shape only
 * (no version/variant bits), so no genuine row is ever refused.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidShape(value: unknown): value is string {
  return typeof value === "string" && UUID_SHAPE.test(value.trim());
}

/**
 * The price list, if and only if it belongs to this company.
 *
 * A list id from another tenant resolves exactly like one that does not exist,
 * so the answer never confirms that another company's list is there.
 */
export async function requireCompanyPriceList(supabase: SupabaseClient, companyId: string, priceListId: string) {
  const id = String(priceListId || "").trim();
  if (!isUuidShape(id)) throw new PriceListError("Price list not found.", 404);
  const { data, error } = await supabase
    .from("vyron_customer_price_lists")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new PriceListError("Price list not found.", 404);
  return data as CustomerPriceListRow;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function normalizeStatus(value: string | undefined): "Active" | "Inactive" {
  const normalized = String(value || "Active").trim().toLowerCase();
  return normalized === "inactive" ? "Inactive" : "Active";
}

function normalizeListType(value: string | undefined): "Standard" | "Contract" {
  const normalized = String(value || "Standard").trim().toLowerCase();
  return normalized === "contract" ? "Contract" : "Standard";
}

function computeFinalPrice(input: {
  basePrice: number;
  markupPct: number;
  discountPct: number;
  gpPct: number;
  overridePrice?: number | null;
  costPerUnit: number;
}) {
  if (input.overridePrice != null && Number(input.overridePrice) >= 0) {
    return round4(Number(input.overridePrice));
  }
  const base = Number(input.basePrice || 0);
  const withMarkup = base * (1 + Number(input.markupPct || 0) / 100);
  const withDiscount = withMarkup * (1 - Number(input.discountPct || 0) / 100);
  if (Number(input.gpPct || 0) > 0 && Number(input.gpPct || 0) < 100) {
    const minByGp = Number(input.costPerUnit || 0) / (1 - Number(input.gpPct) / 100);
    return round4(Math.max(withDiscount, minByGp));
  }
  return round4(withDiscount);
}

export async function writeCustomerPriceListAudit(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    eventType: string;
    actor?: string;
    detail?: string;
    priceListId?: string;
    priceListItemId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("vyron_customer_price_list_audit_log").insert({
    company_id: params.companyId,
    event_type: params.eventType,
    actor: params.actor || "system",
    detail: params.detail || null,
    price_list_id: params.priceListId || null,
    price_list_item_id: params.priceListItemId || null,
    metadata: params.metadata || {},
  });
}

export async function listCustomerPriceLists(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_customer_price_lists")
    .select("*")
    .eq("company_id", companyId)
    .order("list_name", { ascending: true })
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as CustomerPriceListRow[];
}

export async function createCustomerPriceList(
  supabase: SupabaseClient,
  companyId: string,
  params: {
    listName: string;
    listType?: "Standard" | "Contract";
    status?: "Active" | "Inactive";
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    notes?: string;
    createdBy?: string;
  }
) {
  const payload = {
    company_id: companyId,
    list_name: params.listName.trim(),
    list_type: params.listType || "Standard",
    status: params.status || "Active",
    effective_from: params.effectiveFrom || null,
    effective_to: params.effectiveTo || null,
    notes: params.notes || null,
    created_by: params.createdBy || null,
  };

  const { data, error } = await supabase
    .from("vyron_customer_price_lists")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("vyron_customer_price_list_versions").insert({
    company_id: companyId,
    price_list_id: data.id,
    version: Number(data.version || 1),
    change_type: "created",
    payload,
    created_by: params.createdBy || null,
  });

  await writeCustomerPriceListAudit(supabase, {
    companyId,
    eventType: "Price List Created",
    actor: params.createdBy,
    detail: `Created ${params.listName}`,
    priceListId: String(data.id),
  });

  return data as CustomerPriceListRow;
}

export async function upsertCustomerPriceListItems(
  supabase: SupabaseClient,
  companyId: string,
  params: {
    priceListId: string;
    items: Array<{
      productId: string;
      basePrice?: number;
      markupPct?: number;
      discountPct?: number;
      gpPct?: number;
      overridePrice?: number | null;
      status?: "Active" | "Inactive";
      effectiveFrom?: string | null;
      effectiveTo?: string | null;
    }>;
    actor?: string;
  }
) {
  if (!params.items.length) return { upserted: 0 };

  // The list id arrives from the browser: it must be one of this company's lists.
  await requireCompanyPriceList(supabase, companyId, params.priceListId);

  const productIds = params.items.map((item) => item.productId);
  if (!productIds.every(isUuidShape)) throw new PriceListError("Product not found.", 404);
  const { data: products, error: productError } = await supabase
    .from("vyron_cost_products")
    .select("id, total_cost, selling_price")
    .eq("company_id", companyId)
    .in("id", productIds);
  if (productError) throw new Error(productError.message);

  const productMap = new Map((products || []).map((row) => [String(row.id), row]));
  const rows = params.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new Error(`Product ${item.productId} not found for active company.`);
    }
    const basePrice = Number(item.basePrice ?? product.selling_price ?? 0);
    const costPerUnit = Number(product.total_cost || 0);
    const markupPct = Number(item.markupPct ?? 0);
    const discountPct = Number(item.discountPct ?? 0);
    const gpPct = Number(item.gpPct ?? 0);
    const overridePrice = item.overridePrice == null ? null : Number(item.overridePrice);
    const finalPrice = computeFinalPrice({
      basePrice,
      markupPct,
      discountPct,
      gpPct,
      overridePrice,
      costPerUnit,
    });

    return {
      company_id: companyId,
      price_list_id: params.priceListId,
      product_id: item.productId,
      base_price: round4(basePrice),
      markup_pct: round4(markupPct),
      discount_pct: round4(discountPct),
      gp_pct: round4(gpPct),
      override_price: overridePrice,
      final_price: finalPrice,
      status: item.status || "Active",
      effective_from: item.effectiveFrom || null,
      effective_to: item.effectiveTo || null,
      updated_at: new Date().toISOString(),
    };
  });

  const { data, error } = await supabase
    .from("vyron_customer_price_list_items")
    .upsert(rows, { onConflict: "price_list_id,product_id" })
    .select("id");
  if (error) throw new Error(error.message);

  await writeCustomerPriceListAudit(supabase, {
    companyId,
    eventType: "Price List Items Upserted",
    actor: params.actor,
    detail: `Upserted ${rows.length} item(s)`,
    priceListId: params.priceListId,
    metadata: { upserted: rows.length },
  });

  return { upserted: rows.length, ids: (data || []).map((row) => String(row.id)) };
}

export async function assignCustomerPriceLists(
  supabase: SupabaseClient,
  companyId: string,
  params: {
    customerId: string;
    defaultPriceListId?: string | null;
    contractPriceListId?: string | null;
    status?: "Active" | "Inactive";
    notes?: string;
    actor?: string;
  }
) {
  // Every identifier here arrives from the browser: each must belong to this company.
  if (!isUuidShape(params.customerId)) throw new PriceListError("Customer not found.", 404);
  const { data: customer, error: customerError } = await supabase
    .from("vyron_customers")
    .select("id")
    .eq("company_id", companyId)
    .eq("id", params.customerId)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!customer) throw new PriceListError("Customer not found.", 404);
  for (const listId of [params.defaultPriceListId, params.contractPriceListId]) {
    if (listId) await requireCompanyPriceList(supabase, companyId, listId);
  }

  const { data, error } = await supabase
    .from("vyron_customer_price_list_assignments")
    .upsert(
      {
        company_id: companyId,
        customer_id: params.customerId,
        default_price_list_id: params.defaultPriceListId || null,
        contract_price_list_id: params.contractPriceListId || null,
        status: params.status || "Active",
        notes: params.notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,customer_id" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeCustomerPriceListAudit(supabase, {
    companyId,
    eventType: "Customer Price List Assignment Updated",
    actor: params.actor,
    detail: `Updated assignment for customer ${params.customerId}`,
    metadata: {
      customerId: params.customerId,
      defaultPriceListId: params.defaultPriceListId || null,
      contractPriceListId: params.contractPriceListId || null,
    },
  });

  return data;
}

export async function resolveCustomerProductPrice(
  supabase: SupabaseClient,
  companyId: string,
  params: {
    customerId?: string | null;
    productId: string;
    asOfDate?: string;
  }
): Promise<ResolvedCustomerPrice> {
  const date = params.asOfDate || new Date().toISOString().slice(0, 10);

  const { data: product, error: productError } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, selling_price, total_cost")
    .eq("company_id", companyId)
    .eq("id", params.productId)
    .maybeSingle();
  if (productError) throw new Error(productError.message);
  if (!product) throw new Error("Product not found for the active company.");

  let assignment:
    | {
        default_price_list_id: string | null;
        contract_price_list_id: string | null;
        price_source_rule?: string | null;
      }
    | null = null;

  if (params.customerId) {
    // The whole row, so a database that does not yet carry price_source_rule
    // still answers rather than erroring on an unknown column.
    const { data: row, error: assignmentError } = await supabase
      .from("vyron_customer_price_list_assignments")
      .select("*")
      .eq("company_id", companyId)
      .eq("customer_id", params.customerId)
      .eq("status", "Active")
      .maybeSingle();
    if (assignmentError) throw new Error(assignmentError.message);
    assignment = row || null;
  }

  const candidatePriceListIds = [
    assignment?.contract_price_list_id || null,
    assignment?.default_price_list_id || null,
  ].filter(Boolean) as string[];

  if (candidatePriceListIds.length) {
    const { data: items, error: itemError } = await supabase
      .from("vyron_customer_price_list_items")
      .select("price_list_id, final_price, effective_from, effective_to")
      .eq("company_id", companyId)
      .eq("product_id", params.productId)
      .eq("status", "Active")
      .in("price_list_id", candidatePriceListIds);
    if (itemError) throw new Error(itemError.message);

    /*
     * Deterministic choice: a contract price beats a default price, and within
     * a list the most recently effective price wins. Until 2026-09-22 this took
     * whichever valid row the database happened to return first, so when both
     * lists priced the product the contract price was not guaranteed to apply.
     */
    const contractId = assignment?.contract_price_list_id || null;
    const valid = (items || [])
      .filter((row) => {
        const start = row.effective_from ? String(row.effective_from) <= date : true;
        const end = row.effective_to ? String(row.effective_to) >= date : true;
        return start && end;
      })
      .sort((a, b) => {
        const contractRank = Number(b.price_list_id === contractId) - Number(a.price_list_id === contractId);
        if (contractRank !== 0) return contractRank;
        return String(b.effective_from || "").localeCompare(String(a.effective_from || ""));
      })[0];

    if (valid) {
      const source = valid.price_list_id === assignment?.contract_price_list_id ? "contract" : "default";
      return {
        source,
        priceListId: String(valid.price_list_id),
        sellingPrice: Number(valid.final_price || 0),
        costPerUnit: Number(product.total_cost || 0),
        productId: String(product.id),
        productName: String(product.product_name || ""),
      };
    }
  }

  /*
   * The customer has a price list, it does not cover this product, and this
   * customer is configured to be priced by their list alone. Quoting the
   * master price here would put a price in front of them that nobody agreed,
   * so nothing is quoted: the product is unavailable to them until someone
   * adds it to their list.
   */
  if (assignedListOnly(assignment)) {
    return {
      source: "unavailable",
      priceListId: null,
      sellingPrice: 0,
      costPerUnit: Number(product.total_cost || 0),
      productId: String(product.id),
      productName: String(product.product_name || ""),
    };
  }

  return {
    source: "product_master",
    priceListId: null,
    sellingPrice: Number(product.selling_price || 0),
    costPerUnit: Number(product.total_cost || 0),
    productId: String(product.id),
    productName: String(product.product_name || ""),
  };
}

export async function listCustomerPriceListAssignments(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_customer_price_list_assignments")
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function importCustomerPriceListRows(
  supabase: SupabaseClient,
  companyId: string,
  params: {
    fileName: string;
    rows: PriceImportRow[];
    actor?: string;
    createMissingProducts?: boolean;
  }
) {
  const actor = params.actor || "system";
  const createMissingProducts = Boolean(params.createMissingProducts);

  let customers: Array<{ id: string; customer_name: string | null; customer_code?: string | null }> = [];
  let customerCodeSupported = true;

  const withCode = await supabase
    .from("vyron_customers")
    .select("id, customer_name, customer_code")
    .eq("company_id", companyId);

  if (withCode.error) {
    const missingCustomerCodeColumn =
      withCode.error.code === "42703" ||
      String(withCode.error.message || "").toLowerCase().includes("customer_code");

    if (!missingCustomerCodeColumn) {
      throw new Error(withCode.error.message);
    }

    customerCodeSupported = false;
    const withoutCode = await supabase
      .from("vyron_customers")
      .select("id, customer_name")
      .eq("company_id", companyId);
    if (withoutCode.error) throw new Error(withoutCode.error.message);
    customers = (withoutCode.data || []) as Array<{ id: string; customer_name: string | null }>;
  } else {
    customers = (withCode.data || []) as Array<{ id: string; customer_name: string | null; customer_code?: string | null }>;
  }

  const { data: products, error: productsError } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, sku, total_cost, selling_price")
    .eq("company_id", companyId);
  if (productsError) throw new Error(productsError.message);

  const customerByCode = new Map(
    customers
      .map((row) => [String(row.customer_code || "").trim().toLowerCase(), row] as const)
      .filter(([key]) => Boolean(key))
  );
  const customerByName = new Map<string, Array<{ id: string; customer_name: string | null; customer_code?: string | null }>>();
  for (const row of customers) {
    const key = String(row.customer_name || "").trim().toLowerCase();
    if (!key) continue;
    const bucket = customerByName.get(key) || [];
    bucket.push(row);
    customerByName.set(key, bucket);
  }
  /**
   * Empty keys must never enter these maps. Products commonly have no SKU, so
   * keying on "" collapsed every such product onto a single entry and made a
   * blank product_code resolve to one arbitrary product for every row — silently
   * writing prices against the wrong product. customerByCode already filters
   * empty keys; these now match that behaviour.
   */
  const productByCode = new Map(
    (products || [])
      .map((row) => [String(row.sku || "").trim().toLowerCase(), row] as const)
      .filter(([key]) => Boolean(key))
  );
  const productByName = new Map(
    (products || [])
      .map((row) => [String(row.product_name || "").trim().toLowerCase(), row] as const)
      .filter(([key]) => Boolean(key))
  );

  const errors: Array<{ row: number; error: string }> = [];
  const accepted: Array<{
    rowNumber: number;
    listName: string;
    listType: "Standard" | "Contract";
    customerId: string | null;
    productId: string;
    basePrice: number;
    markupPct: number;
    discountPct: number;
    gpPct: number;
    overridePrice: number | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    status: "Active" | "Inactive";
  }> = [];

  for (let index = 0; index < params.rows.length; index += 1) {
    const input = params.rows[index];
    const rowNumber = index + 2;
    const listName = String(input.listName || "").trim();
    if (!listName) {
      errors.push({ row: rowNumber, error: "List Name is required." });
      continue;
    }

    const productCodeKey = String(input.productCode || "").trim().toLowerCase();
    let product = productCodeKey ? productByCode.get(productCodeKey) || null : null;
    if (!product && input.productName) {
      product = productByName.get(String(input.productName).trim().toLowerCase()) || null;
    }

    if (!product && createMissingProducts) {
      const fallbackName = String(input.productName || input.productCode || "").trim();
      if (!fallbackName) {
        errors.push({ row: rowNumber, error: "Product Code or Product Name is required." });
        continue;
      }
      const { data: created, error: createError } = await supabase
        .from("vyron_cost_products")
        .insert({
          company_id: companyId,
          product_name: fallbackName,
          sku: String(input.productCode || fallbackName).trim(),
          selling_price: Number(input.basePrice || 0),
          total_cost: 0,
          category: "Imported",
          is_active: true,
        })
        .select("id, product_name, sku, total_cost, selling_price")
        .single();
      if (createError) {
        errors.push({ row: rowNumber, error: createError.message });
        continue;
      }
      product = created;
      productByCode.set(String(created.sku || "").toLowerCase(), created);
      productByName.set(String(created.product_name || "").toLowerCase(), created);
    }

    if (!product) {
      errors.push({ row: rowNumber, error: `Product not found (${input.productCode || input.productName || "unknown"}).` });
      continue;
    }

    let customerId: string | null = null;
    if (input.customerCode || input.customerName) {
      const customerCodeKey = String(input.customerCode || "").trim().toLowerCase();
      const customerNameKey = String(input.customerName || "").trim().toLowerCase();

      const byCode = customerCodeSupported && customerCodeKey ? customerByCode.get(customerCodeKey) || null : null;

      let byName: { id: string; customer_name: string | null; customer_code?: string | null } | null = null;
      if (customerNameKey) {
        const byNameMatches = customerByName.get(customerNameKey) || [];
        if (byNameMatches.length > 1) {
          errors.push({
            row: rowNumber,
            error: `Customer name matches multiple records (${input.customerName}). Provide customer_code or use a unique customer name.`,
          });
          continue;
        }
        byName = byNameMatches[0] || null;
      }

      const customer = byCode || byName;
      if (!customer) {
        errors.push({ row: rowNumber, error: `Customer not found (${input.customerCode || input.customerName || "unknown"}).` });
        continue;
      }
      customerId = String(customer.id);
    }

    accepted.push({
      rowNumber,
      listName,
      listType: normalizeListType(input.listType),
      customerId,
      productId: String(product.id),
      basePrice: Number(input.basePrice ?? product.selling_price ?? 0),
      markupPct: Number(input.markupPct ?? 0),
      discountPct: Number(input.discountPct ?? 0),
      gpPct: Number(input.gpPct ?? 0),
      overridePrice: input.overridePrice == null ? null : Number(input.overridePrice),
      effectiveFrom: input.effectiveFrom || null,
      effectiveTo: input.effectiveTo || null,
      status: normalizeStatus(input.status),
    });
  }

  if (!accepted.length) {
    await supabase.from("vyron_customer_price_list_import_runs").insert({
      company_id: companyId,
      file_name: params.fileName,
      status: "Failed",
      total_rows: params.rows.length,
      imported_rows: 0,
      rejected_rows: errors.length,
      create_missing_products: createMissingProducts,
      error_report: errors,
      created_by: actor,
    });
    return { imported: 0, rejected: errors.length, errors };
  }

  const groupedByList = new Map<string, typeof accepted>();
  for (const row of accepted) {
    const key = `${row.listType}::${row.listName}`;
    const bucket = groupedByList.get(key) || [];
    bucket.push(row);
    groupedByList.set(key, bucket);
  }

  const createdLists = new Map<string, CustomerPriceListRow>();
  let importedRows = 0;

  try {
    for (const [key, rows] of groupedByList.entries()) {
      const [listType, listName] = key.split("::");

      const { data: existingList, error: existingError } = await supabase
        .from("vyron_customer_price_lists")
        .select("*")
        .eq("company_id", companyId)
        .eq("list_name", listName)
        .eq("list_type", listType)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);

      let priceList = existingList as CustomerPriceListRow | null;
      if (!priceList) {
        priceList = await createCustomerPriceList(supabase, companyId, {
          listName,
          listType: normalizeListType(listType),
          status: "Active",
          createdBy: actor,
        });
      }
      createdLists.set(key, priceList);

      /**
       * vyron_customer_price_list_items is unique on (price_list_id, product_id),
       * and the upsert below targets that key. PostgreSQL rejects a single
       * statement containing two rows with the same conflict key —
       * "ON CONFLICT DO UPDATE command cannot affect row a second time" — so the
       * batch must be collapsed to one row per product BEFORE it is sent.
       *
       * Identical duplicates collapse silently. Duplicates that disagree on any
       * pricing field are a data conflict: the product is rejected with a clear
       * error rather than arbitrarily picking one price.
       */
      const priceSignature = (row: (typeof rows)[number]) =>
        JSON.stringify([
          row.basePrice,
          row.markupPct,
          row.discountPct,
          row.gpPct,
          row.overridePrice,
          row.status,
          row.effectiveFrom,
          row.effectiveTo,
        ]);

      const byProduct = new Map<string, typeof rows>();
      for (const row of rows) {
        const bucket = byProduct.get(row.productId) || [];
        bucket.push(row);
        byProduct.set(row.productId, bucket);
      }

      const deduped: typeof rows = [];
      const conflictedProducts = new Set<string>();

      for (const [productId, bucket] of byProduct) {
        const signatures = new Set(bucket.map(priceSignature));
        if (signatures.size === 1) {
          deduped.push(bucket[0]);
          continue;
        }
        conflictedProducts.add(productId);
        const rowNumbers = bucket.map((row) => row.rowNumber).join(", ");
        for (const row of bucket) {
          errors.push({
            row: row.rowNumber,
            error: `Conflicting price-list rows for the same product in "${listName}" (rows ${rowNumbers}). The same product appears more than once with different values — resolve the conflict and re-import. Nothing was imported for this product.`,
          });
        }
      }

      if (deduped.length) {
        await upsertCustomerPriceListItems(supabase, companyId, {
          priceListId: priceList.id,
          actor,
          items: deduped.map((row) => ({
            productId: row.productId,
            basePrice: row.basePrice,
            markupPct: row.markupPct,
            discountPct: row.discountPct,
            gpPct: row.gpPct,
            overridePrice: row.overridePrice,
            status: row.status,
            effectiveFrom: row.effectiveFrom,
            effectiveTo: row.effectiveTo,
          })),
        });
      }

      for (const row of rows) {
        // A product whose rows conflict was not written — it must not be
        // counted as imported, and must not drive a customer assignment.
        if (conflictedProducts.has(row.productId)) continue;

        if (row.customerId) {
          if (row.listType === "Contract") {
            await assignCustomerPriceLists(supabase, companyId, {
              customerId: row.customerId,
              contractPriceListId: priceList.id,
              actor,
            });
          } else {
            await assignCustomerPriceLists(supabase, companyId, {
              customerId: row.customerId,
              defaultPriceListId: priceList.id,
              actor,
            });
          }
        }
        importedRows += 1;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Price list import failed.";
    errors.push({ row: 0, error: message });
    await supabase.from("vyron_customer_price_list_import_runs").insert({
      company_id: companyId,
      file_name: params.fileName,
      status: "Failed",
      total_rows: params.rows.length,
      imported_rows: 0,
      rejected_rows: params.rows.length,
      create_missing_products: createMissingProducts,
      error_report: errors,
      created_by: actor,
    });
    throw new Error(message);
  }

  const rejectedRows = params.rows.length - importedRows;
  await supabase.from("vyron_customer_price_list_import_runs").insert({
    company_id: companyId,
    file_name: params.fileName,
    status: rejectedRows > 0 ? "Partial" : "Completed",
    total_rows: params.rows.length,
    imported_rows: importedRows,
    rejected_rows: rejectedRows,
    create_missing_products: createMissingProducts,
    error_report: errors,
    created_by: actor,
  });

  await writeCustomerPriceListAudit(supabase, {
    companyId,
    eventType: "Price List Import Completed",
    actor,
    detail: `Imported ${importedRows}/${params.rows.length}`,
    metadata: {
      fileName: params.fileName,
      importedRows,
      rejectedRows,
      errors,
    },
  });

  return {
    imported: importedRows,
    rejected: rejectedRows,
    errors,
  };
}

/* ------------------------------------------------------------------------ */
/* Price list editor                                                         */
/*                                                                           */
/* Every function takes companyId from the verified session and re-checks    */
/* each identifier the browser supplied against it: the list, the item and   */
/* the product must all belong to this company, and the item to this list.   */
/* Nothing is hard-deleted — a product leaves a list by becoming Inactive,    */
/* which the customer catalogue already honours — and every change is        */
/* written to vyron_customer_price_list_audit_log with before and after.      */
/* ------------------------------------------------------------------------ */

/** The largest price numeric(14,4) can hold, with headroom. */
const MAX_LIST_PRICE = 999_999_999;

/** A list price a person typed: a finite number above zero. */
export function parseListPrice(value: unknown): number {
  const text = typeof value === "string" ? value.trim().replace(",", ".") : value;
  const price = typeof text === "number" ? text : typeof text === "string" && text !== "" ? Number(text) : NaN;
  if (!Number.isFinite(price)) throw new PriceListError("Enter a valid price.");
  if (price <= 0) throw new PriceListError("The price must be more than zero.");
  if (price > MAX_LIST_PRICE) throw new PriceListError("That price is too large.");
  return round4(price);
}

function productIsActive(row: { status?: string | null; product_status?: string | null }) {
  const blocked = ["inactive", "archived", "discontinued", "disabled"];
  return !blocked.includes(String(row.status || "").toLowerCase()) && !blocked.includes(String(row.product_status || "").toLowerCase());
}

export type PriceListDetailItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  finalPrice: number;
  status: "Active" | "Inactive";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  updatedAt: string | null;
};

export type PriceListDetail = {
  list: CustomerPriceListRow;
  items: PriceListDetailItem[];
  assignedCustomers: Array<{ customerId: string; customerName: string; role: "Default" | "Contract"; status: string }>;
  history: Array<{ at: string; event: string; actor: string | null; detail: string | null }>;
};

async function requireListItem(supabase: SupabaseClient, companyId: string, priceListId: string, itemId: string) {
  const id = String(itemId || "").trim();
  if (!isUuidShape(id)) throw new PriceListError("Price list item not found.", 404);
  const { data, error } = await supabase
    .from("vyron_customer_price_list_items")
    .select("*")
    .eq("company_id", companyId)
    .eq("price_list_id", priceListId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new PriceListError("Price list item not found.", 404);
  return data as CustomerPriceListItemRow;
}

async function productNameFor(supabase: SupabaseClient, companyId: string, productId: string) {
  const { data } = await supabase
    .from("vyron_cost_products")
    .select("product_name")
    .eq("company_id", companyId)
    .eq("id", productId)
    .maybeSingle();
  return String(data?.product_name || productId);
}

/** One price list with its products, the customers on it, and its recent history. */
export async function getCustomerPriceListDetail(
  supabase: SupabaseClient,
  companyId: string,
  priceListId: string
): Promise<PriceListDetail> {
  const list = await requireCompanyPriceList(supabase, companyId, priceListId);

  const { data: itemRows, error: itemError } = await supabase
    .from("vyron_customer_price_list_items")
    .select("id, product_id, final_price, status, effective_from, effective_to, updated_at")
    .eq("company_id", companyId)
    .eq("price_list_id", list.id);
  if (itemError) throw new Error(itemError.message);

  const productIds = [...new Set((itemRows || []).map((row) => String(row.product_id)))];
  const productById = new Map<string, { product_name: string | null; sku: string | null }>();
  if (productIds.length) {
    const { data: products, error: productError } = await supabase
      .from("vyron_cost_products")
      .select("id, product_name, sku")
      .eq("company_id", companyId)
      .in("id", productIds);
    if (productError) throw new Error(productError.message);
    for (const p of products || []) productById.set(String(p.id), { product_name: p.product_name, sku: p.sku ?? null });
  }

  const items: PriceListDetailItem[] = (itemRows || [])
    .map((row) => {
      const product = productById.get(String(row.product_id));
      return {
        id: String(row.id),
        productId: String(row.product_id),
        productName: String(product?.product_name || "Unknown product"),
        sku: product?.sku ? String(product.sku) : null,
        finalPrice: Number(row.final_price || 0),
        status: (row.status === "Inactive" ? "Inactive" : "Active") as "Active" | "Inactive",
        effectiveFrom: row.effective_from ? String(row.effective_from) : null,
        effectiveTo: row.effective_to ? String(row.effective_to) : null,
        updatedAt: row.updated_at ? String(row.updated_at) : null,
      };
    })
    .sort((a, b) => (a.status === b.status ? a.productName.localeCompare(b.productName) : a.status === "Active" ? -1 : 1));

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from("vyron_customer_price_list_assignments")
    .select("customer_id, default_price_list_id, contract_price_list_id, status")
    .eq("company_id", companyId);
  if (assignmentError) throw new Error(assignmentError.message);
  const onThisList = (assignmentRows || []).filter(
    (a) => String(a.default_price_list_id || "") === list.id || String(a.contract_price_list_id || "") === list.id
  );
  const customerNames = new Map<string, string>();
  if (onThisList.length) {
    const { data: customers, error: customerError } = await supabase
      .from("vyron_customers")
      .select("id, customer_name")
      .eq("company_id", companyId)
      .in("id", onThisList.map((a) => String(a.customer_id)));
    if (customerError) throw new Error(customerError.message);
    for (const c of customers || []) customerNames.set(String(c.id), String(c.customer_name || "Customer"));
  }
  const assignedCustomers = onThisList
    .filter((a) => customerNames.has(String(a.customer_id)))
    .map((a) => ({
      customerId: String(a.customer_id),
      customerName: customerNames.get(String(a.customer_id))!,
      role: (String(a.contract_price_list_id || "") === list.id ? "Contract" : "Default") as "Default" | "Contract",
      status: String(a.status || "Active"),
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName));

  // History is informative; a failure to read it never blocks the editor.
  const { data: auditRows } = await supabase
    .from("vyron_customer_price_list_audit_log")
    .select("created_at, event_type, actor, detail")
    .eq("company_id", companyId)
    .eq("price_list_id", list.id)
    .order("created_at", { ascending: false })
    .limit(15);
  const history = (auditRows || []).map((row) => ({
    at: String(row.created_at || ""),
    event: String(row.event_type || ""),
    actor: row.actor ? String(row.actor) : null,
    detail: row.detail ? String(row.detail) : null,
  }));

  return { list, items, assignedCustomers, history };
}

/**
 * Put a product on a list at a price.
 *
 * One row per product per list (the table's unique key). An Active row for the
 * product is a duplicate and is refused; an Inactive one is brought back at the
 * new price rather than duplicated, and the audit log says so.
 */
export async function addCustomerPriceListItem(
  supabase: SupabaseClient,
  companyId: string,
  params: { priceListId: string; productId: string; price: unknown; actor: string }
) {
  const list = await requireCompanyPriceList(supabase, companyId, params.priceListId);
  const price = parseListPrice(params.price);

  const productId = String(params.productId || "").trim();
  if (!productId) throw new PriceListError("Choose a product.");
  if (!isUuidShape(productId)) throw new PriceListError("Product not found.", 404);
  const { data: product, error: productError } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, status, product_status")
    .eq("company_id", companyId)
    .eq("id", productId)
    .maybeSingle();
  if (productError) throw new Error(productError.message);
  // Another company's product resolves exactly like a missing one.
  if (!product) throw new PriceListError("Product not found.", 404);
  if (!productIsActive(product)) throw new PriceListError("That product is inactive and cannot be priced.");

  const { data: existing, error: existingError } = await supabase
    .from("vyron_customer_price_list_items")
    .select("*")
    .eq("company_id", companyId)
    .eq("price_list_id", list.id)
    .eq("product_id", productId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing && existing.status === "Active") {
    throw new PriceListError(`${product.product_name} is already on this price list. Edit its price instead.`, 409);
  }

  const now = new Date().toISOString();
  let itemId: string;
  if (existing) {
    const { error } = await supabase
      .from("vyron_customer_price_list_items")
      .update({ status: "Active", override_price: price, final_price: price, effective_to: null, updated_at: now })
      .eq("company_id", companyId)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    itemId = String(existing.id);
  } else {
    const { data, error } = await supabase
      .from("vyron_customer_price_list_items")
      .insert({
        company_id: companyId,
        price_list_id: list.id,
        product_id: productId,
        base_price: price,
        override_price: price,
        final_price: price,
        status: "Active",
        updated_at: now,
      })
      .select("id")
      .single();
    if (error) {
      // The unique key caught a concurrent add of the same product.
      if (String(error.code) === "23505") throw new PriceListError(`${product.product_name} is already on this price list.`, 409);
      throw new Error(error.message);
    }
    itemId = String(data.id);
  }

  await writeCustomerPriceListAudit(supabase, {
    companyId,
    eventType: existing ? "Price List Item Reactivated" : "Price List Item Added",
    actor: params.actor,
    detail: `${existing ? "Reactivated" : "Added"} ${product.product_name} at ${price}`,
    priceListId: list.id,
    priceListItemId: itemId,
    metadata: { productId, newPrice: price, previousPrice: existing ? Number(existing.final_price) : null, previousStatus: existing?.status ?? null },
  });
  return { itemId, reactivated: Boolean(existing) };
}

/** Change the price of a product already on the list. */
export async function updateCustomerPriceListItemPrice(
  supabase: SupabaseClient,
  companyId: string,
  params: { priceListId: string; itemId: string; price: unknown; actor: string }
) {
  const list = await requireCompanyPriceList(supabase, companyId, params.priceListId);
  const item = await requireListItem(supabase, companyId, list.id, params.itemId);
  const price = parseListPrice(params.price);
  const previous = Number(item.final_price || 0);

  const { error } = await supabase
    .from("vyron_customer_price_list_items")
    .update({ override_price: price, final_price: price, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("price_list_id", list.id)
    .eq("id", item.id);
  if (error) throw new Error(error.message);

  const name = await productNameFor(supabase, companyId, String(item.product_id));
  await writeCustomerPriceListAudit(supabase, {
    companyId,
    eventType: "Price List Item Price Changed",
    actor: params.actor,
    detail: `${name}: ${previous} → ${price}`,
    priceListId: list.id,
    priceListItemId: item.id,
    metadata: { productId: item.product_id, previousPrice: previous, newPrice: price },
  });
  return { itemId: item.id, previousPrice: previous, price };
}

/**
 * Take a product off the list (Inactive) or put it back (Active).
 *
 * The row and its price are kept: the customer catalogue only offers Active
 * items, so Inactive removes it from every customer on this list at once.
 */
export async function setCustomerPriceListItemStatus(
  supabase: SupabaseClient,
  companyId: string,
  params: { priceListId: string; itemId: string; status: unknown; actor: string }
) {
  const status = params.status === "Active" ? "Active" : params.status === "Inactive" ? "Inactive" : null;
  if (!status) throw new PriceListError("Status must be Active or Inactive.");
  const list = await requireCompanyPriceList(supabase, companyId, params.priceListId);
  const item = await requireListItem(supabase, companyId, list.id, params.itemId);
  if (item.status === status) return { itemId: item.id, status, changed: false };
  if (status === "Active" && !(Number(item.final_price) > 0)) {
    throw new PriceListError("Set a price above zero before reactivating this product.");
  }

  const { error } = await supabase
    .from("vyron_customer_price_list_items")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("price_list_id", list.id)
    .eq("id", item.id);
  if (error) throw new Error(error.message);

  const name = await productNameFor(supabase, companyId, String(item.product_id));
  await writeCustomerPriceListAudit(supabase, {
    companyId,
    eventType: status === "Inactive" ? "Price List Item Deactivated" : "Price List Item Reactivated",
    actor: params.actor,
    detail: `${status === "Inactive" ? "Removed" : "Restored"} ${name}`,
    priceListId: list.id,
    priceListItemId: item.id,
    metadata: { productId: item.product_id, previousStatus: item.status, newStatus: status, price: Number(item.final_price) },
  });
  return { itemId: item.id, status, changed: true };
}
