import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listCustomerContactsAsCustomers,
  updateContactRoles,
  upsertVyronContact,
} from "@/lib/vyron-contact-master";
import {
  findOrCreateStockItem,
  listVyronFinishedGoods,
  postStockMovement,
  writeInventoryAudit,
  type VyronFinishedGoodRow,
} from "@/lib/vyron-inventory";
import { getInvoiceStockPostingStatus } from "@/lib/vyron-invoice-stock-status";
import { resolveCustomerProductPrice } from "@/lib/vyron-customer-price-lists";

export type CustomerInvoiceStatus = "Draft" | "Approved" | "Posted" | "Sent" | "Paid" | "Cancelled";

export type CustomerInvoiceLineInput = {
  productId?: string | null;
  productCode?: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  costPerUnit?: number;
};

export type CustomerInvoiceRow = {
  id: string;
  company_id: string | null;
  customer_id: string | null;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: CustomerInvoiceStatus;
  sales_value: number;
  cost_value: number;
  gross_profit: number;
  gp_percentage: number;
  stock_posted: boolean;
  posted_at: string | null;
  stock_reversed: boolean;
  stock_reversed_at: string | null;
  notes: string | null;
};

export type { InvoiceStockPostingStatus } from "@/lib/vyron-invoice-stock-status";
export { getInvoiceStockPostingStatus } from "@/lib/vyron-invoice-stock-status";

export type CustomerInvoiceLineRow = {
  id: string;
  invoice_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  selling_price: number;
  cost_per_unit: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: string }).message || "").toLowerCase();
  const code = String((error as { code?: string }).code || "").toUpperCase();
  return (
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("relation") && message.includes("does not exist")
  );
}

function computeTotals(lines: CustomerInvoiceLineInput[]) {
  let sales = 0;
  let cost = 0;
  for (const line of lines) {
    sales += Number(line.quantity) * Number(line.sellingPrice);
    cost += Number(line.quantity) * Number(line.costPerUnit || 0);
  }
  const gp = sales - cost;
  return {
    sales_value: round2(sales),
    cost_value: round2(cost),
    gross_profit: round2(gp),
    gp_percentage: sales ? round2((gp / sales) * 100) : 0,
  };
}

async function enrichInvoiceLinesFromProductMaster(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string | null | undefined,
  lines: CustomerInvoiceLineInput[]
): Promise<CustomerInvoiceLineInput[]> {
  const productIds = lines.map((line) => line.productId).filter(Boolean) as string[];
  if (!productIds.length) return lines;

  const { data: products, error } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, selling_price, total_cost")
    .eq("company_id", companyId)
    .in("id", productIds);
  if (error) throw new Error(error.message);

  const byId = new Map((products || []).map((product) => [String(product.id), product]));

  const resolved = await Promise.all(
    lines.map(async (line) => {
      if (!line.productId) return line;
      const product = byId.get(line.productId);
      if (!product) return line;
      const customerPrice = await resolveCustomerProductPrice(supabase, companyId, {
        customerId,
        productId: line.productId,
      });
      return {
        ...line,
        productName: line.productName || customerPrice.productName || String(product.product_name || ""),
        sellingPrice:
          Number(line.sellingPrice) > 0 ? Number(line.sellingPrice) : Number(customerPrice.sellingPrice || 0),
        costPerUnit:
          Number(line.costPerUnit) > 0 ? Number(line.costPerUnit) : Number(customerPrice.costPerUnit || 0),
      };
    })
  );

  return resolved;
}

export async function listCustomerInvoices(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_customer_invoices")
    .select("*")
    .eq("company_id", companyId)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as CustomerInvoiceRow[];
}

export async function getCustomerInvoice(supabase: SupabaseClient, id: string, companyId?: string) {
  const [{ data: invoice, error }, { data: lines, error: lineError }] = await Promise.all([
    supabase.from("vyron_customer_invoices").select("*").eq("id", id).maybeSingle(),
    supabase.from("vyron_customer_invoice_lines").select("*").eq("invoice_id", id).order("created_at"),
  ]);
  if (error) throw new Error(error.message);
  if (lineError) throw new Error(lineError.message);
  if (!invoice) return null;
  if (companyId && invoice.company_id && invoice.company_id !== companyId) return null;
  return { invoice: invoice as CustomerInvoiceRow, lines: (lines || []) as CustomerInvoiceLineRow[] };
}

export async function createCustomerInvoice(
  supabase: SupabaseClient,
  companyId: string,
  params: {
    customerId?: string | null;
    customerName: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    dueDate?: string | null;
    notes?: string;
    lines: CustomerInvoiceLineInput[];
  }
) {
  let customerName = params.customerName.trim();
  if (params.customerId) {
    const { data: customer, error: customerError } = await supabase
      .from("vyron_customers")
      .select("id, customer_name")
      .eq("id", params.customerId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (customerError) throw new Error(customerError.message);
    if (!customer) throw new Error("Customer not found for the active company.");
    if (!customerName) customerName = String(customer.customer_name || "").trim();
  }

  const enrichedLines = await enrichInvoiceLinesFromProductMaster(
    supabase,
    companyId,
    params.customerId,
    params.lines
  );

  for (const line of enrichedLines) {
    if (!line.productId) continue;
    const { data: product, error: productError } = await supabase
      .from("vyron_cost_products")
      .select("id")
      .eq("id", line.productId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (productError) throw new Error(productError.message);
    if (!product) {
      throw new Error(`Product "${line.productName}" not found for the active company.`);
    }
  }

  const totals = computeTotals(enrichedLines);
  const invoiceNumber =
    params.invoiceNumber ||
    `SI-${String(Date.now()).slice(-8)}`;

  const { data: invoice, error } = await supabase
    .from("vyron_customer_invoices")
    .insert({
      company_id: companyId,
      customer_id: params.customerId || null,
      customer_name: customerName || params.customerName,
      invoice_number: invoiceNumber,
      invoice_date: params.invoiceDate || new Date().toISOString().slice(0, 10),
      due_date: params.dueDate || null,
      status: "Draft",
      notes: params.notes || null,
      ...totals,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const lineRows = enrichedLines.map((line) => ({
    invoice_id: invoice.id,
    product_id: line.productId || null,
    product_name: line.productName,
    quantity: line.quantity,
    selling_price: line.sellingPrice,
    cost_per_unit: line.costPerUnit || 0,
  }));
  const { error: linesError } = await supabase.from("vyron_customer_invoice_lines").insert(lineRows);
  if (linesError) throw new Error(linesError.message);

  return invoice as CustomerInvoiceRow;
}

export async function updateCustomerInvoiceStatus(
  supabase: SupabaseClient,
  id: string,
  status: CustomerInvoiceStatus,
  companyId?: string
) {
  let query = supabase
    .from("vyron_customer_invoices")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);
  return data as CustomerInvoiceRow;
}

export async function deleteCustomerInvoice(supabase: SupabaseClient, companyId: string, id: string) {
  const loaded = await getCustomerInvoice(supabase, id, companyId);
  if (!loaded) throw new Error("Invoice not found.");
  if (loaded.invoice.stock_posted && !loaded.invoice.stock_reversed) {
    throw new Error("Posted invoice stock must be reversed before delete.");
  }

  const { error: linesError } = await supabase
    .from("vyron_customer_invoice_lines")
    .delete()
    .eq("invoice_id", id);
  if (linesError) throw new Error(linesError.message);

  const { error } = await supabase
    .from("vyron_customer_invoices")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function resolveProductMasterFromFinishedGood(
  supabase: SupabaseClient,
  companyId: string,
  fg: VyronFinishedGoodRow
) {
  const fgName = fg.product_name.toLowerCase();
  const fgCode = fg.product_code.toLowerCase();
  const { data: products, error } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, sku, total_cost")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return (
    (products || []).find((product) => {
      const name = String(product.product_name || "").toLowerCase();
      const sku = String(product.sku || "").toLowerCase();
      return name === fgName || (fgCode && (sku === fgCode || name === fgCode));
    }) || null
  );
}

type ResolvedInvoiceProduct = {
  productId: string;
  productName: string;
  productCode: string;
  unitCost: number;
  legacyFinishedGoodId?: string;
};

async function resolveProductIdForInvoiceLine(
  supabase: SupabaseClient,
  companyId: string,
  finishedGoods: VyronFinishedGoodRow[],
  line: CustomerInvoiceLineRow
): Promise<ResolvedInvoiceProduct | null> {
  if (line.product_id) {
    const { data: product } = await supabase
      .from("vyron_cost_products")
      .select("id, product_name, sku, total_cost")
      .eq("id", line.product_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (product) {
      return {
        productId: String(product.id),
        productName: String(product.product_name || line.product_name),
        productCode: String(product.sku || `PRD-${String(product.id).slice(0, 8).toUpperCase()}`),
        unitCost: Number(line.cost_per_unit || product.total_cost || 0),
      };
    }

    const byFinishedGoodId = finishedGoods.find((item) => item.id === line.product_id);
    if (byFinishedGoodId) {
      const matchedProduct = await resolveProductMasterFromFinishedGood(supabase, companyId, byFinishedGoodId);
      if (matchedProduct) {
        return {
          productId: String(matchedProduct.id),
          productName: String(matchedProduct.product_name || line.product_name),
          productCode: String(
            matchedProduct.sku || `PRD-${String(matchedProduct.id).slice(0, 8).toUpperCase()}`
          ),
          unitCost: Number(line.cost_per_unit || matchedProduct.total_cost || byFinishedGoodId.latest_actual_cost || 0),
          legacyFinishedGoodId: byFinishedGoodId.id,
        };
      }
    }
  }

  const lineName = line.product_name.toLowerCase();
  const { data: products, error } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, sku, total_cost")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  const byName = (products || []).find((product) => {
    const name = String(product.product_name || "").toLowerCase();
    const sku = String(product.sku || "").toLowerCase();
    return name === lineName || (sku && sku === lineName);
  });
  if (byName) {
    return {
      productId: String(byName.id),
      productName: String(byName.product_name || line.product_name),
      productCode: String(byName.sku || `PRD-${String(byName.id).slice(0, 8).toUpperCase()}`),
      unitCost: Number(line.cost_per_unit || byName.total_cost || 0),
    };
  }

  const byFinishedGoodName = finishedGoods.find(
    (item) =>
      item.product_name.toLowerCase() === lineName || item.product_code.toLowerCase() === lineName
  );
  if (!byFinishedGoodName) return null;

  const matchedProduct = await resolveProductMasterFromFinishedGood(supabase, companyId, byFinishedGoodName);
  if (!matchedProduct) return null;

  return {
    productId: String(matchedProduct.id),
    productName: String(matchedProduct.product_name || line.product_name),
    productCode: String(matchedProduct.sku || `PRD-${String(matchedProduct.id).slice(0, 8).toUpperCase()}`),
    unitCost: Number(line.cost_per_unit || matchedProduct.total_cost || byFinishedGoodName.latest_actual_cost || 0),
    legacyFinishedGoodId: byFinishedGoodName.id,
  };
}

async function getFinishedGoodsStockQty(
  supabase: SupabaseClient,
  companyId: string,
  productId: string,
  legacyFinishedGoodId?: string | null
): Promise<{ qty: number; missingStockItem: boolean }> {
  const { data: primary } = await supabase
    .from("vyron_cost_stock_items")
    .select("qty_on_hand")
    .eq("company_id", companyId)
    .eq("entity_type", "finished_goods")
    .eq("entity_id", productId)
    .maybeSingle();

  let qty = Number(primary?.qty_on_hand ?? 0);
  let missingStockItem = !primary;

  if (legacyFinishedGoodId && legacyFinishedGoodId !== productId) {
    const { data: legacy } = await supabase
      .from("vyron_cost_stock_items")
      .select("qty_on_hand")
      .eq("company_id", companyId)
      .eq("entity_type", "finished_goods")
      .eq("entity_id", legacyFinishedGoodId)
      .maybeSingle();
    if (legacy) {
      qty += Number(legacy.qty_on_hand ?? 0);
      missingStockItem = false;
    }
  }

  return { qty, missingStockItem: missingStockItem && qty <= 0 };
}

/** @deprecated Use resolveProductIdForInvoiceLine for stock operations. */
async function resolveFinishedGood(
  supabase: SupabaseClient,
  companyId: string,
  finishedGoods: VyronFinishedGoodRow[],
  line: CustomerInvoiceLineRow
): Promise<VyronFinishedGoodRow | undefined> {
  if (line.product_id) {
    const byFinishedGoodId = finishedGoods.find((item) => item.id === line.product_id);
    if (byFinishedGoodId) return byFinishedGoodId;

    const { data: product } = await supabase
      .from("vyron_cost_products")
      .select("product_name, sku")
      .eq("id", line.product_id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (product) {
      const productName = String(product.product_name || "").toLowerCase();
      const sku = String(product.sku || "").toLowerCase();
      const byProductMaster = finishedGoods.find((item) => {
        const fgName = item.product_name.toLowerCase();
        const fgCode = item.product_code.toLowerCase();
        return fgName === productName || (sku && (fgCode === sku || fgName === sku));
      });
      if (byProductMaster) return byProductMaster;
    }
  }

  const lineName = line.product_name.toLowerCase();
  return finishedGoods.find(
    (item) =>
      item.product_name.toLowerCase() === lineName ||
      item.product_code.toLowerCase() === lineName
  );
}

async function reduceFinishedGoodStock(
  supabase: SupabaseClient,
  fg: VyronFinishedGoodRow,
  qtyOut: number,
  unitCost: number,
  allowNegative = false
) {
  const currentStock = Number(fg.current_stock || 0);
  if (!allowNegative && qtyOut > currentStock) {
    throw new Error(`Insufficient finished goods stock for ${fg.product_name}: available ${currentStock}, required ${qtyOut}.`);
  }
  const nextStock = round2(currentStock - qtyOut);
  const nextValue = round2(Math.max(0, nextStock) * unitCost);
  const { error } = await supabase
    .from("vyron_finished_goods")
    .update({
      current_stock: nextStock,
      stock_value: nextValue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fg.id);
  if (error) throw new Error(error.message);
  return { previousStock: currentStock, nextStock, negative: nextStock < 0 };
}

async function restoreFinishedGoodStock(
  supabase: SupabaseClient,
  fg: VyronFinishedGoodRow,
  qtyIn: number,
  unitCost: number
) {
  const currentStock = Number(fg.current_stock || 0);
  const nextStock = round2(currentStock + qtyIn);
  const nextValue = round2(nextStock * unitCost);
  const { error } = await supabase
    .from("vyron_finished_goods")
    .update({
      current_stock: nextStock,
      stock_value: nextValue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fg.id);
  if (error) throw new Error(error.message);
  return { previousStock: currentStock, nextStock };
}

async function insertSaleStockMovement(
  supabase: SupabaseClient,
  companyId: string,
  params: {
    invoiceId: string;
    invoiceNumber: string;
    invoiceDate: string;
    productId: string;
    productName: string;
    quantityOut: number;
    unitCost: number;
  }
) {
  const { error } = await supabase.from("vyron_stock_movements").insert({
    company_id: companyId,
    movement_date: params.invoiceDate,
    item_type: "finished_good",
    item_id: params.productId,
    item_name: params.productName,
    movement_type: "SALE",
    reference_number: params.invoiceNumber,
    quantity_in: 0,
    quantity_out: params.quantityOut,
    unit_cost: params.unitCost,
    related_document_id: params.invoiceId,
    notes: "Customer Invoice",
  });
  if (error) throw new Error(error.message);
}

async function insertSaleReversalStockMovement(
  supabase: SupabaseClient,
  companyId: string,
  params: {
    invoiceId: string;
    invoiceNumber: string;
    invoiceDate: string;
    productId: string;
    productName: string;
    quantityIn: number;
    unitCost: number;
  }
) {
  const { error } = await supabase.from("vyron_stock_movements").insert({
    company_id: companyId,
    movement_date: new Date().toISOString().slice(0, 10),
    item_type: "finished_good",
    item_id: params.productId,
    item_name: params.productName,
    movement_type: "SALE_REVERSAL",
    reference_number: params.invoiceNumber,
    quantity_in: params.quantityIn,
    quantity_out: 0,
    unit_cost: params.unitCost,
    related_document_id: params.invoiceId,
    notes: "Customer Invoice Reversal",
  });
  if (error) throw new Error(error.message);
}

export type InvoiceStockShortage = {
  productName: string;
  available: number;
  required: number;
  missingStockItem: boolean;
};

export async function checkInvoiceStockAvailability(
  supabase: SupabaseClient,
  companyId: string,
  lines: CustomerInvoiceLineRow[]
): Promise<InvoiceStockShortage[]> {
  const finishedGoods = await listVyronFinishedGoods(supabase, companyId);
  const shortages: InvoiceStockShortage[] = [];

  for (const line of lines) {
    const qty = Number(line.quantity || 0);
    if (qty <= 0) continue;
    const resolved = await resolveProductIdForInvoiceLine(supabase, companyId, finishedGoods, line);
    if (!resolved) {
      shortages.push({
        productName: line.product_name,
        available: 0,
        required: qty,
        missingStockItem: true,
      });
      continue;
    }

    const { qty: available, missingStockItem } = await getFinishedGoodsStockQty(
      supabase,
      companyId,
      resolved.productId,
      resolved.legacyFinishedGoodId
    );
    if (qty > available) {
      shortages.push({
        productName: line.product_name,
        available,
        required: qty,
        missingStockItem,
      });
    }
  }

  return shortages;
}

async function updateCustomerSalesHistory(
  supabase: SupabaseClient,
  customerId: string | null,
  invoice: CustomerInvoiceRow
) {
  if (!customerId) return;
  const { data: customer, error } = await supabase
    .from("vyron_customers")
    .select("id, company_id, total_sales, invoice_count")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!customer) throw new Error("Customer not found for invoice sales history update.");

  if (invoice.company_id && customer.company_id && customer.company_id !== invoice.company_id) {
    throw new Error("Customer company mismatch for invoice sales history update.");
  }

  const totalSales = round2(Number(customer.total_sales || 0) + Number(invoice.sales_value || 0));
  const invoiceCount = Number(customer.invoice_count || 0) + 1;
  const average = invoiceCount ? round2(totalSales / invoiceCount) : 0;

  let updateQuery = supabase
    .from("vyron_customers")
    .update({
      total_sales: totalSales,
      invoice_count: invoiceCount,
      average_invoice_value: average,
      last_invoice_date: invoice.invoice_date,
    })
    .eq("id", customerId);

  if (invoice.company_id) {
    updateQuery = updateQuery.eq("company_id", invoice.company_id);
  }

  const { error: updateError } = await updateQuery;
  if (updateError) throw new Error(updateError.message);
}

async function queueXeroCustomerInvoice(
  supabase: SupabaseClient,
  companyId: string,
  invoice: CustomerInvoiceRow
) {
  const { data: existing } = await supabase
    .from("vyron_xero_sync_queue")
    .select("id")
    .eq("company_id", companyId)
    .eq("reference_number", invoice.invoice_number)
    .eq("entity_type", "Customer Invoice")
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("vyron_xero_sync_queue")
    .insert({
      company_id: companyId,
      entity_type: "Customer Invoice",
      entity_id: invoice.id,
      reference_number: invoice.invoice_number,
      destination: "Xero Sales Invoice",
      status: "Ready",
      payload: {
        customerName: invoice.customer_name,
        invoiceNumber: invoice.invoice_number,
        invoiceDate: invoice.invoice_date,
        salesValue: invoice.sales_value,
      },
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function postCustomerInvoiceStock(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string,
  options: { actor?: string; allowOverride?: boolean; updateInvoiceStatus?: boolean } = {}
) {
  const actor = options.actor || "system";
  const loaded = await getCustomerInvoice(supabase, invoiceId, companyId);
  if (!loaded) throw new Error("Invoice not found.");
  const { invoice, lines } = loaded;

  if (invoice.stock_posted && !invoice.stock_reversed) {
    return {
      invoice,
      warnings: ["Invoice stock already posted."],
      alreadyPosted: true,
      stockPostingStatus: getInvoiceStockPostingStatus(invoice),
    };
  }

  if (invoice.stock_reversed) {
    throw new Error("Reversed invoice stock cannot be posted again without creating a new invoice.");
  }

  if (["Cancelled"].includes(invoice.status)) {
    throw new Error("Cancelled invoices cannot be posted.");
  }

  const shortages = await checkInvoiceStockAvailability(supabase, companyId, lines);
  if (shortages.length && !options.allowOverride) {
    const detail = shortages
      .map((item) =>
        item.missingStockItem
          ? `${item.productName}: no stock item linked`
          : `${item.productName}: available ${item.available}, required ${item.required}`
      )
      .join("; ");
    throw new Error(`Insufficient stock. ${detail}`);
  }

  const finishedGoods = await listVyronFinishedGoods(supabase, companyId);
  const warnings: string[] = shortages.map((item) =>
    item.missingStockItem
      ? `${item.productName}: no finished good / stock item linked.`
      : `${item.productName}: insufficient stock (available ${item.available}, required ${item.required}).`
  );

  for (const line of lines) {
    const qty = Number(line.quantity || 0);
    if (qty <= 0) continue;
    const resolved = await resolveProductIdForInvoiceLine(supabase, companyId, finishedGoods, line);
    if (!resolved) {
      if (options.allowOverride) {
        warnings.push(`No product / finished good found for ${line.product_name}. Stock movement skipped.`);
      }
      continue;
    }

    const unitCost = Number(line.cost_per_unit || resolved.unitCost || 0);

    await insertSaleStockMovement(supabase, companyId, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      productId: resolved.productId,
      productName: line.product_name,
      quantityOut: qty,
      unitCost,
    });

    const stockItem = await findOrCreateStockItem(supabase, companyId, {
      entityType: "finished_goods",
      entityId: resolved.productId,
      itemCode: resolved.productCode,
      description: resolved.productName,
      category: "Finished Goods",
      unit: "units",
      currentCost: unitCost,
    });

    await postStockMovement(supabase, {
      companyId,
      stockItemId: stockItem.id,
      movementType: "Customer Sale",
      quantityOut: qty,
      unitCost,
      referenceType: "customer_invoice",
      referenceId: invoice.id,
      referenceLabel: invoice.invoice_number,
      actor,
      movementDate: invoice.invoice_date,
      allowNegative: Boolean(options.allowOverride),
      metadata: { reason: "Customer Invoice", productName: line.product_name },
    });

    await writeInventoryAudit(supabase, {
      companyId,
      stockItemId: stockItem.id,
      eventType: "Customer Invoice Sale",
      actor,
      detail: `SALE ${invoice.invoice_number}: ${line.product_name} -${qty}`,
      referenceType: "customer_invoice",
      referenceId: invoice.id,
    });
  }

  const patch: Record<string, unknown> = {
    stock_posted: true,
    stock_reversed: false,
    stock_reversed_at: null,
    posted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (options.updateInvoiceStatus !== false && invoice.status !== "Posted") {
    patch.status = "Posted";
  }

  const { data: posted, error } = await supabase
    .from("vyron_customer_invoices")
    .update(patch)
    .eq("id", invoice.id)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (options.updateInvoiceStatus !== false) {
    await updateCustomerSalesHistory(supabase, invoice.customer_id, posted as CustomerInvoiceRow);
    await queueXeroCustomerInvoice(supabase, companyId, posted as CustomerInvoiceRow);
  }

  return {
    invoice: posted as CustomerInvoiceRow,
    warnings,
    alreadyPosted: false,
    stockPostingStatus: getInvoiceStockPostingStatus(posted as CustomerInvoiceRow),
  };
}

export async function reverseCustomerInvoiceStock(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string,
  actor = "system"
) {
  const loaded = await getCustomerInvoice(supabase, invoiceId, companyId);
  if (!loaded) throw new Error("Invoice not found.");
  const { invoice, lines } = loaded;

  if (invoice.stock_reversed) {
    return {
      invoice,
      warnings: ["Invoice stock already reversed."],
      alreadyReversed: true,
      stockPostingStatus: getInvoiceStockPostingStatus(invoice),
    };
  }

  if (!invoice.stock_posted) {
    throw new Error("Invoice stock has not been posted.");
  }

  const finishedGoods = await listVyronFinishedGoods(supabase, companyId);
  const { data: saleMovements, error: movementError } = await supabase
    .from("vyron_cost_stock_ledger")
    .select("*")
    .eq("company_id", companyId)
    .eq("reference_type", "customer_invoice")
    .eq("reference_id", invoice.id)
    .eq("movement_type", "Customer Sale");
  if (movementError) throw new Error(movementError.message);

  const movementByStockItem = new Map((saleMovements || []).map((row) => [row.stock_item_id as string, row]));

  for (const line of lines) {
    const qty = Number(line.quantity || 0);
    if (qty <= 0) continue;
    const resolved = await resolveProductIdForInvoiceLine(supabase, companyId, finishedGoods, line);
    if (!resolved) continue;

    const unitCost = Number(line.cost_per_unit || resolved.unitCost || 0);

    await insertSaleReversalStockMovement(supabase, companyId, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      productId: resolved.productId,
      productName: line.product_name,
      quantityIn: qty,
      unitCost,
    });

    const stockItem = await findOrCreateStockItem(supabase, companyId, {
      entityType: "finished_goods",
      entityId: resolved.productId,
      itemCode: resolved.productCode,
      description: resolved.productName,
      category: "Finished Goods",
      unit: "units",
      currentCost: unitCost,
    });

    let sourceMovement = movementByStockItem.get(stockItem.id);
    if (!sourceMovement && resolved.legacyFinishedGoodId) {
      const legacyStockItem = await findOrCreateStockItem(supabase, companyId, {
        entityType: "finished_goods",
        entityId: resolved.legacyFinishedGoodId,
        itemCode: resolved.productCode,
        description: resolved.productName,
        category: "Finished Goods",
        unit: "units",
        currentCost: unitCost,
      });
      sourceMovement = movementByStockItem.get(legacyStockItem.id);
    }
    const reversalQty = Number(sourceMovement?.quantity_out || qty);

    await postStockMovement(supabase, {
      companyId,
      stockItemId: stockItem.id,
      movementType: "Customer Sale Reversal",
      quantityIn: reversalQty,
      unitCost,
      referenceType: "customer_invoice_reversal",
      referenceId: invoice.id,
      referenceLabel: invoice.invoice_number,
      actor,
      movementDate: new Date().toISOString(),
      metadata: { reason: "Customer Invoice Reversal", productName: line.product_name },
    });

    await writeInventoryAudit(supabase, {
      companyId,
      stockItemId: stockItem.id,
      eventType: "Customer Invoice Reversal",
      actor,
      detail: `REVERSAL ${invoice.invoice_number}: ${line.product_name} +${reversalQty}`,
      referenceType: "customer_invoice_reversal",
      referenceId: invoice.id,
    });
  }

  const { data: reversed, error } = await supabase
    .from("vyron_customer_invoices")
    .update({
      stock_reversed: true,
      stock_reversed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return {
    invoice: reversed as CustomerInvoiceRow,
    warnings: [],
    alreadyReversed: false,
    stockPostingStatus: getInvoiceStockPostingStatus(reversed as CustomerInvoiceRow),
  };
}

export async function postCustomerInvoice(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string,
  actor = "system"
) {
  return postCustomerInvoiceStock(supabase, companyId, invoiceId, { actor, updateInvoiceStatus: true });
}

export type CustomerRow = {
  id: string;
  company_id: string | null;
  customer_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  total_sales: number;
  last_invoice_date: string | null;
  invoice_count: number;
  average_invoice_value: number;
  category?: string | null;
  invoice_email?: string | null;
  terms?: string | null;
  vat_number?: string | null;
  status?: string | null;
  credit_limit?: number | null;
  on_hold?: boolean | null;
  outstanding_orders?: number;
  outstanding_invoices?: number;
  average_payment_days?: number;
  lifetime_value?: number;
  total_gp?: number;
};

export async function listCustomersWithHistory(supabase: SupabaseClient, companyId: string) {
  const [baseCustomers, { data: invoices, error: invoiceError }, { data: salesOrders, error: orderError }] =
    await Promise.all([
      listCustomerContactsAsCustomers(supabase, companyId),
      supabase
        .from("vyron_customer_invoices")
        .select("customer_id, customer_name, sales_value, gross_profit, status, invoice_date, updated_at")
        .eq("company_id", companyId),
      supabase
        .from("vyron_customer_sales_orders")
        .select("customer_id, customer_name, total, status")
        .eq("company_id", companyId),
    ]);

  if (invoiceError && !isMissingTableError(invoiceError)) throw new Error(invoiceError.message);
  if (orderError && !isMissingTableError(orderError)) throw new Error(orderError.message);

  const byCustomer = new Map<
    string,
    {
      outstandingInvoices: number;
      outstandingOrders: number;
      lifetimeValue: number;
      totalGp: number;
      paidDays: number[];
    }
  >();

  for (const row of invoices || []) {
    const key = String(row.customer_id || row.customer_name || "");
    if (!key) continue;
    const current = byCustomer.get(key) || {
      outstandingInvoices: 0,
      outstandingOrders: 0,
      lifetimeValue: 0,
      totalGp: 0,
      paidDays: [],
    };

    const status = String(row.status || "");
    const salesValue = Number(row.sales_value || 0);
    current.lifetimeValue += salesValue;
    current.totalGp += Number(row.gross_profit || 0);
    if (!["Paid", "Cancelled"].includes(status)) current.outstandingInvoices += salesValue;
    if (status === "Paid" && row.invoice_date && row.updated_at) {
      const from = new Date(String(row.invoice_date));
      const to = new Date(String(row.updated_at));
      const diff = to.getTime() - from.getTime();
      if (Number.isFinite(diff) && diff >= 0) current.paidDays.push(Math.round(diff / 86400000));
    }
    byCustomer.set(key, current);
  }

  for (const row of salesOrders || []) {
    const key = String(row.customer_id || row.customer_name || "");
    if (!key) continue;
    const current = byCustomer.get(key) || {
      outstandingInvoices: 0,
      outstandingOrders: 0,
      lifetimeValue: 0,
      totalGp: 0,
      paidDays: [],
    };
    const status = String(row.status || "");
    if (!["Invoiced", "Cancelled"].includes(status)) {
      current.outstandingOrders += Number(row.total || 0);
    }
    byCustomer.set(key, current);
  }

  return ((baseCustomers || []) as CustomerRow[]).map((customer) => {
    const merged =
      byCustomer.get(String(customer.id || "")) ||
      byCustomer.get(String(customer.customer_name || "")) || {
        outstandingInvoices: 0,
        outstandingOrders: 0,
        lifetimeValue: Number(customer.total_sales || 0),
        totalGp: 0,
        paidDays: [],
      };

    const avgPaymentDays =
      merged.paidDays.length > 0
        ? Math.round((merged.paidDays.reduce((sum, days) => sum + days, 0) / merged.paidDays.length) * 100) / 100
        : 0;

    return {
      ...customer,
      outstanding_orders: Math.round(merged.outstandingOrders * 100) / 100,
      outstanding_invoices: Math.round(merged.outstandingInvoices * 100) / 100,
      average_payment_days: avgPaymentDays,
      lifetime_value: Math.round(merged.lifetimeValue * 100) / 100,
      total_gp: Math.round(merged.totalGp * 100) / 100,
    };
  });
}

export async function getCustomerById(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string
) {
  const { data, error } = await supabase
    .from("vyron_customers")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as CustomerRow | null) || null;
}

export async function createCustomer(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    customerName: string;
    category?: string;
    contactEmail?: string;
    invoiceEmail?: string;
    phone?: string;
    terms?: string;
    vatNumber?: string;
    status?: string;
    creditLimit?: number;
    onHold?: boolean;
  }
) {
  const { data, error } = await supabase
    .from("vyron_customers")
    .insert({
      company_id: companyId,
      customer_name: input.customerName.trim(),
      contact_person: input.category || null,
      email: input.contactEmail || input.invoiceEmail || null,
      phone: input.phone || null,
      active: input.status !== "Inactive",
      category: input.category || "Customer",
      invoice_email: input.invoiceEmail || input.contactEmail || null,
      terms: input.terms || "30 Days",
      vat_number: input.vatNumber || null,
      status: input.status || "Active",
      credit_limit: input.creditLimit ?? 0,
      on_hold: Boolean(input.onHold),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const customer = data as CustomerRow & { xero_contact_id?: string | null };
  await upsertVyronContact(supabase, companyId, {
    contact_name: customer.customer_name,
    email: customer.email,
    phone: customer.phone,
    xero_contact_id: customer.xero_contact_id ?? null,
    is_customer: true,
  });
  return customer;
}

export async function updateCustomer(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string,
  input: Partial<{
    customerName: string;
    category: string;
    contactEmail: string;
    invoiceEmail: string;
    phone: string;
    terms: string;
    vatNumber: string;
    status: string;
    creditLimit: number;
    onHold: boolean;
  }>
) {
  const { data: existingCustomer } = await supabase
    .from("vyron_customers")
    .select("id, customer_name, email, phone, xero_contact_id")
    .eq("id", customerId)
    .eq("company_id", companyId)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  if (input.customerName !== undefined) patch.customer_name = input.customerName.trim();
  if (input.category !== undefined) {
    patch.category = input.category;
    patch.contact_person = input.category;
  }
  if (input.contactEmail !== undefined) patch.email = input.contactEmail;
  if (input.invoiceEmail !== undefined) patch.invoice_email = input.invoiceEmail;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.terms !== undefined) patch.terms = input.terms;
  if (input.vatNumber !== undefined) patch.vat_number = input.vatNumber;
  if (input.status !== undefined) {
    patch.status = input.status;
    patch.active = input.status !== "Inactive";
  }
  if (input.creditLimit !== undefined) patch.credit_limit = Number(input.creditLimit || 0);
  if (input.onHold !== undefined) patch.on_hold = Boolean(input.onHold);

  const { data, error } = await supabase
    .from("vyron_customers")
    .update(patch)
    .eq("id", customerId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const updated = data as CustomerRow & { xero_contact_id?: string | null };

  let existingContactId: string | null = null;
  const xeroContactId = String(updated.xero_contact_id || existingCustomer?.xero_contact_id || "").trim();

  if (xeroContactId) {
    const { data: byXero } = await supabase
      .from("vyron_contacts")
      .select("id")
      .eq("company_id", companyId)
      .eq("xero_contact_id", xeroContactId)
      .maybeSingle();
    existingContactId = byXero?.id ? String(byXero.id) : null;
  }

  if (!existingContactId && existingCustomer?.customer_name) {
    const { data: byOldName } = await supabase
      .from("vyron_contacts")
      .select("id")
      .eq("company_id", companyId)
      .ilike("contact_name", String(existingCustomer.customer_name))
      .maybeSingle();
    existingContactId = byOldName?.id ? String(byOldName.id) : null;
  }

  if (!existingContactId && updated.customer_name) {
    const { data: byNewName } = await supabase
      .from("vyron_contacts")
      .select("id")
      .eq("company_id", companyId)
      .ilike("contact_name", String(updated.customer_name))
      .maybeSingle();
    existingContactId = byNewName?.id ? String(byNewName.id) : null;
  }

  if (existingContactId) {
    await supabase
      .from("vyron_contacts")
      .update({
        contact_name: updated.customer_name,
        email: updated.email,
        phone: updated.phone,
        xero_contact_id: xeroContactId || null,
        is_customer: true,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("id", existingContactId);
  } else {
    await upsertVyronContact(supabase, companyId, {
      contact_name: updated.customer_name,
      email: updated.email,
      phone: updated.phone,
      xero_contact_id: xeroContactId || null,
      is_customer: true,
    });
  }

  return updated;
}

async function clearCustomerRoleOnContact(
  supabase: SupabaseClient,
  companyId: string,
  customer: { customer_name: string; xero_contact_id?: string | null }
) {
  const customerName = String(customer.customer_name || "").trim();
  const xeroContactId = customer.xero_contact_id?.trim() || null;
  if (!customerName && !xeroContactId) return;

  let contactId: string | null = null;
  if (xeroContactId) {
    const { data } = await supabase
      .from("vyron_contacts")
      .select("id")
      .eq("company_id", companyId)
      .eq("xero_contact_id", xeroContactId)
      .maybeSingle();
    contactId = data?.id ? String(data.id) : null;
  }
  if (!contactId && customerName) {
    const { data } = await supabase
      .from("vyron_contacts")
      .select("id")
      .eq("company_id", companyId)
      .ilike("contact_name", customerName)
      .maybeSingle();
    contactId = data?.id ? String(data.id) : null;
  }
  if (!contactId) return;

  await updateContactRoles(supabase, companyId, contactId, { is_customer: false });
}

export async function deleteCustomer(supabase: SupabaseClient, companyId: string, customerId: string) {
  const { data: customer, error: fetchError } = await supabase
    .from("vyron_customers")
    .select("id, invoice_count, customer_name, xero_contact_id")
    .eq("id", customerId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!customer) throw new Error("Customer not found.");

  let invoiceCount = Number(customer.invoice_count || 0);
  if (invoiceCount === 0) {
    const { count, error: countError } = await supabase
      .from("vyron_customer_invoices")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("customer_id", customerId);
    if (countError) throw new Error(countError.message);
    invoiceCount = count || 0;
  }

  if (invoiceCount > 0) {
    const { data, error } = await supabase
      .from("vyron_customers")
      .update({ status: "Inactive", active: false })
      .eq("id", customerId)
      .eq("company_id", companyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await clearCustomerRoleOnContact(supabase, companyId, customer);
    return { ok: true as const, archived: true as const, customer: data as CustomerRow };
  }

  const { error } = await supabase.from("vyron_customers").delete().eq("id", customerId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
  await clearCustomerRoleOnContact(supabase, companyId, customer);
  return { ok: true as const, archived: false as const };
}

export async function listXeroSyncQueue(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_xero_sync_queue")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  let rows = data || [];
  if (rows.some((row) => row.company_id != null)) {
    rows = rows.filter((row) => !row.company_id || row.company_id === companyId);
  }
  return rows;
}

export async function getSalesIntelligence(supabase: SupabaseClient, companyId: string) {
  const invoices = await listCustomerInvoices(supabase, companyId);
  const posted = invoices.filter((inv) => inv.stock_posted || ["Posted", "Sent", "Paid"].includes(inv.status));

  const byCustomer = new Map<string, { customer: string; sales: number; invoices: number }>();
  const byProduct = new Map<string, number>();
  const byMonth = new Map<string, number>();

  for (const invoice of posted) {
    const key = invoice.customer_name;
    const current = byCustomer.get(key) || { customer: key, sales: 0, invoices: 0 };
    current.sales += Number(invoice.sales_value || 0);
    current.invoices += 1;
    byCustomer.set(key, current);

    const month = String(invoice.invoice_date || "").slice(0, 7);
    byMonth.set(month, (byMonth.get(month) || 0) + Number(invoice.sales_value || 0));
  }

  const invoiceIds = posted.map((inv) => inv.id);
  const { data: lineRows } = invoiceIds.length
    ? await supabase.from("vyron_customer_invoice_lines").select("*").in("invoice_id", invoiceIds)
    : { data: [] };
  for (const line of lineRows || []) {
    const parent = posted.find((inv) => inv.id === line.invoice_id);
    if (!parent) continue;
    byProduct.set(line.product_name, (byProduct.get(line.product_name) || 0) + Number(line.quantity || 0) * Number(line.selling_price || 0));
  }

  const salesByCustomer = [...byCustomer.values()].sort((a, b) => b.sales - a.sales);
  const salesByProduct = [...byProduct.entries()]
    .map(([product, sales]) => ({ product, sales: round2(sales) }))
    .sort((a, b) => b.sales - a.sales);
  const monthlySales = [...byMonth.entries()]
    .map(([month, sales]) => ({ month, sales: round2(sales) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    salesByCustomer,
    salesByProduct,
    topCustomers: salesByCustomer.slice(0, 5),
    topProducts: salesByProduct.slice(0, 5),
    monthlySales,
    invoiceTrends: posted.map((inv) => ({
      invoiceNumber: inv.invoice_number,
      date: inv.invoice_date,
      sales: inv.sales_value,
      status: inv.status,
    })),
  };
}

export async function getCustomerStatement(
  supabase: SupabaseClient,
  params: { customerId?: string; customerName?: string; fromDate?: string; toDate?: string; companyId: string }
) {
  if (!params.companyId) throw new Error("No active workspace company.");
  let query = supabase
    .from("vyron_customer_invoices")
    .select("*")
    .eq("company_id", params.companyId)
    .order("invoice_date", { ascending: false });
  if (params.customerId) query = query.eq("customer_id", params.customerId);
  if (params.customerName) query = query.eq("customer_name", params.customerName);
  if (params.fromDate) query = query.gte("invoice_date", params.fromDate);
  if (params.toDate) query = query.lte("invoice_date", params.toDate);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const invoices = (data || []) as CustomerInvoiceRow[];
  const outstanding = invoices
    .filter((inv) => !["Paid", "Cancelled"].includes(inv.status))
    .reduce((sum, inv) => sum + Number(inv.sales_value || 0), 0);

  return {
    invoices,
    outstanding: round2(outstanding),
    totalSales: round2(invoices.reduce((sum, inv) => sum + Number(inv.sales_value || 0), 0)),
  };
}
