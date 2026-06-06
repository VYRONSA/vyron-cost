import type { SupabaseClient } from "@supabase/supabase-js";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import {
  findOrCreateStockItem,
  listVyronFinishedGoods,
  postStockMovement,
  writeInventoryAudit,
  type VyronFinishedGoodRow,
} from "@/lib/vyron-inventory";

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
  notes: string | null;
};

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

export async function listCustomerInvoices(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const { data, error } = await supabase
    .from("vyron_customer_invoices")
    .select("*")
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as CustomerInvoiceRow[];
}

export async function getCustomerInvoice(supabase: SupabaseClient, id: string) {
  const [{ data: invoice, error }, { data: lines, error: lineError }] = await Promise.all([
    supabase.from("vyron_customer_invoices").select("*").eq("id", id).maybeSingle(),
    supabase.from("vyron_customer_invoice_lines").select("*").eq("invoice_id", id).order("created_at"),
  ]);
  if (error) throw new Error(error.message);
  if (lineError) throw new Error(lineError.message);
  if (!invoice) return null;
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
    notes?: string;
    lines: CustomerInvoiceLineInput[];
  }
) {
  const totals = computeTotals(params.lines);
  const invoiceNumber =
    params.invoiceNumber ||
    `SI-${String(Date.now()).slice(-8)}`;

  const { data: invoice, error } = await supabase
    .from("vyron_customer_invoices")
    .insert({
      company_id: companyId,
      customer_id: params.customerId || null,
      customer_name: params.customerName,
      invoice_number: invoiceNumber,
      invoice_date: params.invoiceDate || new Date().toISOString().slice(0, 10),
      status: "Draft",
      notes: params.notes || null,
      ...totals,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const lineRows = params.lines.map((line) => ({
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
  status: CustomerInvoiceStatus
) {
  const { data, error } = await supabase
    .from("vyron_customer_invoices")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CustomerInvoiceRow;
}

function resolveFinishedGood(
  finishedGoods: VyronFinishedGoodRow[],
  line: CustomerInvoiceLineRow
): VyronFinishedGoodRow | undefined {
  if (line.product_id) {
    return finishedGoods.find((item) => item.id === line.product_id);
  }
  return finishedGoods.find(
    (item) =>
      item.product_name.toLowerCase() === line.product_name.toLowerCase() ||
      item.product_code.toLowerCase() === line.product_name.toLowerCase()
  );
}

async function reduceFinishedGoodStock(
  supabase: SupabaseClient,
  fg: VyronFinishedGoodRow,
  qtyOut: number,
  unitCost: number
) {
  const currentStock = Number(fg.current_stock || 0);
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

async function updateCustomerSalesHistory(
  supabase: SupabaseClient,
  customerId: string | null,
  invoice: CustomerInvoiceRow
) {
  if (!customerId) return;
  const { data: customer, error } = await supabase
    .from("vyron_customers")
    .select("total_sales, invoice_count")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!customer) return;

  const totalSales = round2(Number(customer.total_sales || 0) + Number(invoice.sales_value || 0));
  const invoiceCount = Number(customer.invoice_count || 0) + 1;
  const average = invoiceCount ? round2(totalSales / invoiceCount) : 0;

  await supabase
    .from("vyron_customers")
    .update({
      total_sales: totalSales,
      invoice_count: invoiceCount,
      average_invoice_value: average,
      last_invoice_date: invoice.invoice_date,
    })
    .eq("id", customerId);
}

async function queueXeroCustomerInvoice(
  supabase: SupabaseClient,
  companyId: string,
  invoice: CustomerInvoiceRow
) {
  const { data: existing } = await supabase
    .from("vyron_xero_sync_queue")
    .select("id")
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

export async function postCustomerInvoice(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string,
  actor = "system"
) {
  const loaded = await getCustomerInvoice(supabase, invoiceId);
  if (!loaded) throw new Error("Invoice not found.");
  const { invoice, lines } = loaded;

  if (invoice.stock_posted) {
    return { invoice, warnings: ["Invoice already posted. Stock was not deducted again."], alreadyPosted: true };
  }

  if (["Cancelled"].includes(invoice.status)) {
    throw new Error("Cancelled invoices cannot be posted.");
  }

  const finishedGoods = await listVyronFinishedGoods(supabase, companyId);
  const warnings: string[] = [];

  for (const line of lines) {
    const qty = Number(line.quantity || 0);
    if (qty <= 0) continue;
    const fg = resolveFinishedGood(finishedGoods, line);
    if (!fg) {
      warnings.push(`No finished good found for ${line.product_name}. Stock movement skipped.`);
      continue;
    }

    const unitCost = Number(line.cost_per_unit || fg.latest_actual_cost || fg.standard_cost || 0);
    const stockResult = await reduceFinishedGoodStock(supabase, fg, qty, unitCost);
    if (stockResult.negative) {
      warnings.push(`${line.product_name}: stock went negative (${stockResult.nextStock}).`);
    }

    await insertSaleStockMovement(supabase, companyId, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      productId: fg.id,
      productName: line.product_name,
      quantityOut: qty,
      unitCost,
    });

    const stockItem = await findOrCreateStockItem(supabase, companyId, {
      entityType: "finished_goods",
      entityId: fg.id,
      itemCode: fg.product_code,
      description: fg.product_name,
      category: fg.category || "Finished Goods",
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

  await updateCustomerSalesHistory(supabase, invoice.customer_id, invoice);
  await queueXeroCustomerInvoice(supabase, companyId, invoice);

  const { data: posted, error } = await supabase
    .from("vyron_customer_invoices")
    .update({
      status: "Posted",
      stock_posted: true,
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return { invoice: posted as CustomerInvoiceRow, warnings, alreadyPosted: false };
}

export async function listCustomersWithHistory(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("vyron_customers").select("*").order("customer_name");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listXeroSyncQueue(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
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

export async function getSalesIntelligence(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
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

  const { data: lineRows } = await supabase.from("vyron_customer_invoice_lines").select("*");
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
  params: { customerId?: string; customerName?: string; fromDate?: string; toDate?: string }
) {
  let query = supabase.from("vyron_customer_invoices").select("*").order("invoice_date", { ascending: false });
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
