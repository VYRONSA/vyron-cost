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

export type ResolvedCustomerPrice = {
  source: "contract" | "default" | "product_master";
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

  const productIds = params.items.map((item) => item.productId);
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
      }
    | null = null;

  if (params.customerId) {
    const { data: row, error: assignmentError } = await supabase
      .from("vyron_customer_price_list_assignments")
      .select("default_price_list_id, contract_price_list_id")
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

    const valid = (items || []).find((row) => {
      const start = row.effective_from ? String(row.effective_from) <= date : true;
      const end = row.effective_to ? String(row.effective_to) >= date : true;
      return start && end;
    });

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
