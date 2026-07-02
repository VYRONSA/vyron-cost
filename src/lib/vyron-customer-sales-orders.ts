import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCustomerInvoice, type CustomerInvoiceRow } from "@/lib/vyron-customer-invoices";
import { createProductionRun } from "@/lib/vyron-manufacturing";
import {
  createProcurementRequisition,
  recommendSupplierForIngredient,
  type ProcurementRequisitionRow,
} from "@/lib/vyron-procurement-requisitions";

export const SALES_ORDER_STATUSES = [
  "Draft",
  "Awaiting Approval",
  "Approved",
  "Picking",
  "Packed",
  "Dispatched",
  "Partially Invoiced",
  "Invoiced",
  "Cancelled",
] as const;

export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export type SalesOrderLineInput = {
  id?: string;
  productId?: string | null;
  description: string;
  quantity: number;
  unit?: string;
  sellingPrice: number;
  discountPct?: number;
  taxRate?: number;
  costPerUnit?: number;
};

export type SalesOrderInput = {
  id?: string;
  customerId?: string | null;
  customerName: string;
  deliveryAddress?: string;
  contactName?: string;
  salesperson?: string;
  warehouse?: string;
  requestedDeliveryDate?: string | null;
  notes?: string;
  lines: SalesOrderLineInput[];
};

export type SalesOrderRow = {
  id: string;
  company_id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string;
  delivery_address: string | null;
  contact_name: string | null;
  salesperson: string | null;
  warehouse: string | null;
  status: SalesOrderStatus;
  requested_delivery_date: string | null;
  notes: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  cost_value: number;
  gross_profit: number;
  gp_percentage: number;
  created_at: string;
  updated_at: string;
};

export type SalesOrderLineRow = {
  id: string;
  company_id: string;
  sales_order_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  selling_price: number;
  discount_pct: number;
  tax_rate: number;
  line_total: number;
  cost_per_unit: number;
  invoiced_qty: number;
  sort_order: number;
};

export type SalesOrderAuditRow = {
  id: string;
  company_id: string;
  sales_order_id: string;
  event_type: string;
  actor: string | null;
  from_status: string | null;
  to_status: string | null;
  detail: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SalesOrderApprovalRuleCode =
  | "LOW_GP"
  | "EXCESSIVE_DISCOUNT"
  | "CREDIT_LIMIT_EXCEEDED"
  | "CUSTOMER_ON_HOLD";

export type SalesOrderApprovalRule = {
  code: SalesOrderApprovalRuleCode;
  message: string;
  severity: "warning" | "critical";
};

export type SalesOrderStockShortage = {
  product_id: string;
  product_name: string;
  linked_bom_id: string | null;
  required_qty: number;
  available_qty: number;
  shortfall_qty: number;
  unit: string;
};

export type SalesOrderPickingLine = {
  sales_order_line_id: string;
  product_id: string | null;
  description: string;
  required_qty: number;
  available_qty: number;
  shortfall_qty: number;
  unit: string;
  pick_status: "Ready" | "Short";
};

export type SalesOrderInsight = {
  order: SalesOrderRow;
  lines: SalesOrderLineRow[];
  picking_list: SalesOrderPickingLine[];
  shortages: SalesOrderStockShortage[];
  manufacturing: {
    stockAvailable: boolean;
    insufficientStock: boolean;
    canManufacture: boolean;
    ingredientsAvailablePct: number;
    estimatedProductionHours: number;
    estimatedManufactureCost: number;
  };
  procurement: {
    missingIngredients: Array<{
      ingredient_id: string | null;
      ingredient_name: string;
      required_qty: number;
      available_qty: number;
      shortage_qty: number;
      unit: string;
      estimated_cost: number;
      supplier_name: string | null;
      supplier_price: number | null;
      lead_time_days: number | null;
    }>;
    estimatedCost: number;
  };
  ai: {
    recommendations: Array<{ label: string; level: "good" | "warning" | "critical" }>;
    expectedProfit: number;
    confidence: number;
  };
  timeline: Array<{
    key: string;
    label: string;
    timestamp: string | null;
    actor: string | null;
    completed: boolean;
  }>;
  traceability: Array<{
    key: string;
    label: string;
    href: string | null;
    reference: string | null;
    status: "linked" | "pending";
  }>;
  approval_rules: SalesOrderApprovalRule[];
  requires_approval: boolean;
  audits: SalesOrderAuditRow[];
};

export type CustomerCommercialKpis = {
  revenue: number;
  gp: number;
  outstandingOrders: number;
  outstandingInvoices: number;
  averagePaymentDays: number;
  lifetimeValue: number;
};

export type CustomerIntelligence = {
  lifetimeValue: number;
  averageGpPct: number;
  latePaymentRisk: "Low" | "Medium" | "High";
  averageOrderSize: number;
  purchaseFrequencyDays: number;
  mostPurchasedProducts: Array<{ productName: string; revenue: number }>;
  predictedNextOrderDate: string | null;
};

const ACTION_STATUS: Record<string, SalesOrderStatus> = {
  submit: "Awaiting Approval",
  approve: "Approved",
  start_picking: "Picking",
  pack: "Packed",
  dispatch: "Dispatched",
  cancel: "Cancelled",
};

const TRANSITIONS: Record<SalesOrderStatus, SalesOrderStatus[]> = {
  Draft: ["Awaiting Approval", "Approved", "Cancelled"],
  "Awaiting Approval": ["Approved", "Draft", "Cancelled"],
  Approved: ["Picking", "Cancelled"],
  Picking: ["Packed", "Cancelled"],
  Packed: ["Dispatched", "Cancelled"],
  Dispatched: ["Partially Invoiced", "Invoiced", "Cancelled"],
  "Partially Invoiced": ["Invoiced", "Cancelled"],
  Invoiced: [],
  Cancelled: [],
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function isSchemaMissingError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: string }).message || "").toLowerCase();
  const code = String((error as { code?: string }).code || "").toUpperCase();
  return (
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("does not exist") ||
    message.includes("column") && message.includes("does not exist")
  );
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function daysBetween(fromDate: string, toDate: string) {
  const a = new Date(fromDate);
  const b = new Date(toDate);
  const diff = b.getTime() - a.getTime();
  if (!Number.isFinite(diff)) return 0;
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

function nextOrderNumber() {
  return `SO-${String(Date.now()).slice(-8)}`;
}

function lineAmounts(line: SalesOrderLineInput) {
  const qty = Number(line.quantity || 0);
  const unitPrice = Number(line.sellingPrice || 0);
  const discountPct = Number(line.discountPct || 0);
  const taxRate = Number(line.taxRate ?? 15);
  const discounted = unitPrice * (1 - discountPct / 100);
  const net = round2(qty * discounted);
  const tax = round2(net * (taxRate / 100));
  return { net, tax, total: round2(net + tax) };
}

export function calculateSalesOrderTotals(lines: SalesOrderLineInput[]) {
  const normalized = lines.map((line) => ({
    quantity: Number(line.quantity || 0),
    sellingPrice: Number(line.sellingPrice || 0),
    discountPct: Number(line.discountPct || 0),
    taxRate: Number(line.taxRate ?? 15),
    costPerUnit: Number(line.costPerUnit || 0),
  }));

  const subtotal = round2(
    normalized.reduce((sum, line) => sum + line.quantity * line.sellingPrice * (1 - line.discountPct / 100), 0)
  );
  const vatAmount = round2(
    normalized.reduce((sum, line) => {
      const net = line.quantity * line.sellingPrice * (1 - line.discountPct / 100);
      return sum + net * (line.taxRate / 100);
    }, 0)
  );
  const costValue = round2(normalized.reduce((sum, line) => sum + line.quantity * line.costPerUnit, 0));
  const total = round2(subtotal + vatAmount);
  const grossProfit = round2(subtotal - costValue);
  const gpPercentage = subtotal > 0 ? round2((grossProfit / subtotal) * 100) : 0;

  return {
    subtotal,
    vatAmount,
    total,
    costValue,
    grossProfit,
    gpPercentage,
  };
}

async function writeSalesOrderAudit(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    salesOrderId: string;
    eventType: string;
    actor?: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    detail?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("vyron_customer_sales_order_audit").insert({
    id: randomUUID(),
    company_id: params.companyId,
    sales_order_id: params.salesOrderId,
    event_type: params.eventType,
    actor: params.actor || "system",
    from_status: params.fromStatus || null,
    to_status: params.toStatus || null,
    detail: params.detail || null,
    metadata: params.metadata || {},
    created_at: new Date().toISOString(),
  });
}

async function listSalesOrderAudit(
  supabase: SupabaseClient,
  companyId: string,
  salesOrderId: string
): Promise<SalesOrderAuditRow[]> {
  const { data, error } = await supabase
    .from("vyron_customer_sales_order_audit")
    .select("*")
    .eq("company_id", companyId)
    .eq("sales_order_id", salesOrderId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as SalesOrderAuditRow[];
}

async function evaluateApprovalRules(
  supabase: SupabaseClient,
  companyId: string,
  input: SalesOrderInput,
  lines: SalesOrderLineInput[],
  totals: ReturnType<typeof calculateSalesOrderTotals>
): Promise<SalesOrderApprovalRule[]> {
  const rules: SalesOrderApprovalRule[] = [];

  if (totals.gpPercentage < 30) {
    rules.push({
      code: "LOW_GP",
      severity: "warning",
      message: `GP ${totals.gpPercentage.toFixed(2)}% is below policy threshold 30%.`,
    });
  }

  const maxDiscount = lines.reduce((highest, line) => Math.max(highest, Number(line.discountPct || 0)), 0);
  if (maxDiscount > 15) {
    rules.push({
      code: "EXCESSIVE_DISCOUNT",
      severity: "warning",
      message: `Discount ${maxDiscount.toFixed(2)}% exceeds 15% policy threshold.`,
    });
  }

  if (input.customerId) {
    const [{ data: customer, error: customerError }, { data: invoices, error: invoiceError }] = await Promise.all([
      supabase
        .from("vyron_customers")
        .select("id, customer_name, status, on_hold, credit_limit")
        .eq("company_id", companyId)
        .eq("id", input.customerId)
        .maybeSingle(),
      supabase
        .from("vyron_customer_invoices")
        .select("sales_value, status")
        .eq("company_id", companyId)
        .eq("customer_id", input.customerId),
    ]);

    let safeCustomer = customer as
      | {
          id?: string;
          customer_name?: string;
          status?: string | null;
          on_hold?: boolean | null;
          credit_limit?: number | null;
        }
      | null;
    if (customerError) {
      if (!isSchemaMissingError(customerError)) throw new Error(customerError.message);
      const { data: fallbackCustomer, error: fallbackCustomerError } = await supabase
        .from("vyron_customers")
        .select("id, customer_name, status")
        .eq("company_id", companyId)
        .eq("id", input.customerId)
        .maybeSingle();
      if (fallbackCustomerError) throw new Error(fallbackCustomerError.message);
      safeCustomer = fallbackCustomer as typeof safeCustomer;
    }

    const safeInvoices = invoiceError
      ? isSchemaMissingError(invoiceError)
        ? []
        : (() => {
            throw new Error(invoiceError.message);
          })()
      : (invoices || []);

    const customerStatus = String(safeCustomer?.status || "").toLowerCase();
    if (safeCustomer?.on_hold || customerStatus.includes("hold")) {
      rules.push({
        code: "CUSTOMER_ON_HOLD",
        severity: "critical",
        message: `Customer ${safeCustomer?.customer_name || input.customerName} is on hold.`,
      });
    }

    const creditLimit = Number(safeCustomer?.credit_limit || 0);
    if (creditLimit > 0) {
      const outstandingInvoices = safeInvoices
        .filter((invoice) => !["Paid", "Cancelled"].includes(String(invoice.status || "")))
        .reduce((sum, invoice) => sum + Number(invoice.sales_value || 0), 0);
      const projectedExposure = round2(outstandingInvoices + totals.total);
      if (projectedExposure > creditLimit) {
        rules.push({
          code: "CREDIT_LIMIT_EXCEEDED",
          severity: "critical",
          message: `Projected exposure ${projectedExposure.toFixed(2)} exceeds credit limit ${creditLimit.toFixed(2)}.`,
        });
      }
    }
  }

  return rules;
}

async function buildPickingList(
  supabase: SupabaseClient,
  companyId: string,
  lines: SalesOrderLineRow[]
): Promise<SalesOrderPickingLine[]> {
  const products = lines.filter((line) => line.product_id);
  const productIds = [...new Set(products.map((line) => String(line.product_id)))];

  const { data: stockItems, error: stockError } = productIds.length
    ? await supabase
        .from("vyron_cost_stock_items")
        .select("entity_id, qty_on_hand")
        .eq("company_id", companyId)
        .eq("entity_type", "finished_goods")
        .in("entity_id", productIds)
    : { data: [], error: null };
  if (stockError) throw new Error(stockError.message);

  const stockByProduct = new Map((stockItems || []).map((row) => [String(row.entity_id), Number(row.qty_on_hand || 0)]));

  return lines.map((line) => {
    if (!line.product_id) {
      return {
        sales_order_line_id: line.id,
        product_id: null,
        description: line.description,
        required_qty: Number(line.quantity || 0),
        available_qty: Number(line.quantity || 0),
        shortfall_qty: 0,
        unit: line.unit || "each",
        pick_status: "Ready",
      };
    }

    const requiredQty = Number(line.quantity || 0);
    const availableQty = Number(stockByProduct.get(String(line.product_id)) || 0);
    const shortfallQty = Math.max(0, round4(requiredQty - availableQty));

    return {
      sales_order_line_id: line.id,
      product_id: line.product_id,
      description: line.description,
      required_qty: requiredQty,
      available_qty: availableQty,
      shortfall_qty: shortfallQty,
      unit: line.unit || "each",
      pick_status: shortfallQty > 0 ? "Short" : "Ready",
    };
  });
}

async function buildSalesOrderShortages(
  supabase: SupabaseClient,
  companyId: string,
  pickingList: SalesOrderPickingLine[]
): Promise<SalesOrderStockShortage[]> {
  const productIds = [...new Set(pickingList.map((line) => line.product_id).filter(Boolean) as string[])];
  const { data: products, error: productError } = productIds.length
    ? await supabase
        .from("vyron_cost_products")
        .select("id, product_name, linked_bom_id")
        .eq("company_id", companyId)
        .in("id", productIds)
    : { data: [], error: null };
  if (productError) throw new Error(productError.message);

  const byProduct = new Map((products || []).map((row) => [String(row.id), row]));
  return pickingList
    .filter((line) => line.product_id && line.shortfall_qty > 0)
    .map((line) => {
      const product = byProduct.get(String(line.product_id));
      return {
        product_id: String(line.product_id),
        product_name: String(product?.product_name || line.description),
        linked_bom_id: product?.linked_bom_id ? String(product.linked_bom_id) : null,
        required_qty: line.required_qty,
        available_qty: line.available_qty,
        shortfall_qty: line.shortfall_qty,
        unit: line.unit,
      };
    });
}

async function buildIngredientShortageLines(
  supabase: SupabaseClient,
  companyId: string,
  shortages: SalesOrderStockShortage[]
) {
  const bomShortages = shortages.filter((row) => row.linked_bom_id);
  if (!bomShortages.length) return [];

  const bomIds = [...new Set(bomShortages.map((row) => String(row.linked_bom_id)))];
  const { data: bomLines, error: bomError } = await supabase
    .from("vyron_cost_bom_lines")
    .select("bom_id, line_type, ingredient_id, line_name, quantity, unit, unit_cost")
    .eq("company_id", companyId)
    .in("bom_id", bomIds)
    .in("line_type", ["Ingredient", "Packaging"]);
  if (bomError) throw new Error(bomError.message);

  const byBom = new Map<string, Array<Record<string, unknown>>>();
  for (const line of bomLines || []) {
    const key = String(line.bom_id || "");
    const current = byBom.get(key) || [];
    current.push(line as Record<string, unknown>);
    byBom.set(key, current);
  }

  const requirements = new Map<string, {
    ingredient_id: string | null;
    ingredient_name: string;
    required_qty: number;
    unit: string;
    estimated_cost: number;
  }>();

  for (const shortage of bomShortages) {
    const lines = byBom.get(String(shortage.linked_bom_id)) || [];
    for (const line of lines) {
      const ingredientId = line.ingredient_id ? String(line.ingredient_id) : null;
      const ingredientName = String(line.line_name || "Ingredient");
      const unit = String(line.unit || "kg");
      const requiredQty = round4(Number(line.quantity || 0) * Number(shortage.shortfall_qty || 0));
      const unitCost = Number(line.unit_cost || 0);
      const key = ingredientId || ingredientName.toLowerCase();
      const current = requirements.get(key) || {
        ingredient_id: ingredientId,
        ingredient_name: ingredientName,
        required_qty: 0,
        unit,
        estimated_cost: 0,
      };
      current.required_qty = round4(current.required_qty + requiredQty);
      current.estimated_cost = round2(current.estimated_cost + requiredQty * unitCost);
      requirements.set(key, current);
    }
  }

  const ingredientIds = [...requirements.values()]
    .map((row) => row.ingredient_id)
    .filter(Boolean) as string[];

  const { data: stocks, error: stockError } = ingredientIds.length
    ? await supabase
        .from("vyron_cost_stock_items")
        .select("entity_id, qty_on_hand")
        .eq("company_id", companyId)
        .in("entity_id", ingredientIds)
    : { data: [], error: null };
  if (stockError) throw new Error(stockError.message);

  const stockByIngredient = new Map((stocks || []).map((row) => [String(row.entity_id), Number(row.qty_on_hand || 0)]));

  return [...requirements.values()]
    .map((row) => {
      const available = row.ingredient_id ? Number(stockByIngredient.get(row.ingredient_id) || 0) : 0;
      const shortageQty = Math.max(0, round4(row.required_qty - available));
      return {
        ingredient_id: row.ingredient_id,
        ingredient_name: row.ingredient_name,
        required_qty: row.required_qty,
        available_qty: available,
        shortage_qty: shortageQty,
        unit: row.unit,
        estimated_cost: row.required_qty > 0 ? round2((row.estimated_cost / row.required_qty) * shortageQty) : 0,
      };
    })
    .filter((row) => row.shortage_qty > 0);
}

async function buildManufacturingInsight(
  supabase: SupabaseClient,
  companyId: string,
  shortages: SalesOrderStockShortage[]
) {
  const manufacturable = shortages.filter((row) => row.linked_bom_id);
  const productIds = shortages.map((row) => row.product_id);

  const { data: products, error: productError } = productIds.length
    ? await supabase
        .from("vyron_cost_products")
        .select("id, total_cost")
        .eq("company_id", companyId)
        .in("id", productIds)
    : { data: [], error: null };
  if (productError) throw new Error(productError.message);

  const costByProduct = new Map((products || []).map((row) => [String(row.id), Number(row.total_cost || 0)]));

  const estimatedManufactureCost = round2(
    manufacturable.reduce((sum, row) => sum + Number(costByProduct.get(row.product_id) || 0) * Number(row.shortfall_qty || 0), 0)
  );
  const estimatedProductionHours = round2(
    manufacturable.reduce((sum, row) => sum + Math.max(0.25, Number(row.shortfall_qty || 0) / 80), 0)
  );

  const ingredientShortages = await buildIngredientShortageLines(supabase, companyId, shortages);
  const required = ingredientShortages.reduce((sum, row) => sum + Number(row.required_qty || 0), 0);
  const available = ingredientShortages.reduce((sum, row) => sum + Number(row.available_qty || 0), 0);
  const ingredientsAvailablePct = required > 0 ? round2((Math.min(required, available) / required) * 100) : 100;

  return {
    stockAvailable: shortages.length === 0,
    insufficientStock: shortages.length > 0,
    canManufacture: manufacturable.length > 0,
    ingredientsAvailablePct,
    estimatedProductionHours,
    estimatedManufactureCost,
  };
}

async function buildProcurementInsight(
  supabase: SupabaseClient,
  companyId: string,
  shortages: SalesOrderStockShortage[]
) {
  const lines = await buildIngredientShortageLines(supabase, companyId, shortages);
  const missingIngredients = [] as Array<{
    ingredient_id: string | null;
    ingredient_name: string;
    required_qty: number;
    available_qty: number;
    shortage_qty: number;
    unit: string;
    estimated_cost: number;
    supplier_name: string | null;
    supplier_price: number | null;
    lead_time_days: number | null;
  }>;

  for (const line of lines) {
    const supplier = await recommendSupplierForIngredient(supabase, companyId, line.ingredient_id || null);
    missingIngredients.push({
      ...line,
      supplier_name: supplier?.supplier_name || null,
      supplier_price: supplier?.last_cost ?? null,
      lead_time_days: supplier?.lead_time_days ?? null,
    });
  }

  return {
    missingIngredients,
    estimatedCost: round2(missingIngredients.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0)),
  };
}

function buildAiCommercialInsight(
  order: SalesOrderRow,
  approvalRules: SalesOrderApprovalRule[],
  shortages: SalesOrderStockShortage[],
  procurementEstimatedCost: number
) {
  const recommendations: Array<{ label: string; level: "good" | "warning" | "critical" }> = [];

  if (order.gp_percentage >= 30) recommendations.push({ label: "GP is above target", level: "good" });
  else recommendations.push({ label: "GP is below target", level: "warning" });

  const customerHold = approvalRules.some((rule) => rule.code === "CUSTOMER_ON_HOLD");
  if (customerHold) recommendations.push({ label: "Customer is on hold", level: "critical" });

  if (shortages.length === 0) recommendations.push({ label: "All stock available", level: "good" });
  else recommendations.push({ label: "Manufacturing required", level: "warning" });

  if (procurementEstimatedCost > 0) recommendations.push({ label: "Cheapest supplier identified for shortages", level: "good" });

  const expectedProfit = round2(Number(order.gross_profit || 0) - procurementEstimatedCost);
  const confidenceRaw = 97 - approvalRules.length * 8 - Math.min(20, shortages.length * 4);
  const confidence = Math.max(55, Math.min(99, confidenceRaw));

  return { recommendations, expectedProfit, confidence };
}

function buildWorkflowTimeline(audits: SalesOrderAuditRow[]) {
  const stageMap: Array<{ key: string; label: string; event: string }> = [
    { key: "created", label: "Created", event: "SALES_ORDER_CREATED" },
    { key: "submitted", label: "Submitted", event: "SALES_ORDER_SUBMIT" },
    { key: "approved", label: "Approved", event: "SALES_ORDER_APPROVE" },
    { key: "picking", label: "Picking", event: "SALES_ORDER_START_PICKING" },
    { key: "packing", label: "Packing", event: "SALES_ORDER_PACK" },
    { key: "dispatched", label: "Dispatched", event: "SALES_ORDER_DISPATCH" },
    { key: "invoiced", label: "Invoiced", event: "CONVERTED_TO_INVOICE" },
  ];

  return stageMap.map((stage) => {
    const hit = audits.find((audit) => audit.event_type === stage.event) || null;
    return {
      key: stage.key,
      label: stage.label,
      timestamp: hit?.created_at || null,
      actor: hit?.actor || null,
      completed: Boolean(hit),
    };
  });
}

async function buildTraceability(
  supabase: SupabaseClient,
  companyId: string,
  order: SalesOrderRow
) {
  const [
    { data: invoiceLinks },
    { data: productionLinks },
    { data: requisitionLinks },
  ] = await Promise.all([
    supabase
      .from("vyron_customer_sales_order_invoice_links")
      .select("invoice_id")
      .eq("company_id", companyId)
      .eq("sales_order_id", order.id),
    supabase
      .from("vyron_customer_sales_order_production_links")
      .select("production_run_id")
      .eq("company_id", companyId)
      .eq("sales_order_id", order.id),
    supabase
      .from("vyron_customer_sales_order_requisition_links")
      .select("requisition_id")
      .eq("company_id", companyId)
      .eq("sales_order_id", order.id),
  ]);

  const invoiceId = invoiceLinks?.[0]?.invoice_id ? String(invoiceLinks[0].invoice_id) : null;
  const runId = productionLinks?.[0]?.production_run_id ? String(productionLinks[0].production_run_id) : null;
  const requisitionId = requisitionLinks?.[0]?.requisition_id ? String(requisitionLinks[0].requisition_id) : null;

  return [
    { key: "sales_order", label: "Sales Order", href: `/customer-sales-orders`, reference: order.order_number, status: "linked" as const },
    {
      key: "production_run",
      label: "Production Run",
      href: runId ? `/production-runs/${runId}` : null,
      reference: runId,
      status: runId ? ("linked" as const) : ("pending" as const),
    },
    {
      key: "requisition",
      label: "Purchase Requisition",
      href: requisitionId ? `/procurement-requisitions/${requisitionId}` : null,
      reference: requisitionId,
      status: requisitionId ? ("linked" as const) : ("pending" as const),
    },
    { key: "goods_receipt", label: "Goods Receipt", href: "/goods-receipts", reference: null, status: "pending" as const },
    { key: "finished_goods", label: "Finished Goods", href: "/inventory/stock", reference: null, status: "pending" as const },
    {
      key: "customer_invoice",
      label: "Customer Invoice",
      href: invoiceId ? "/customer-invoices" : null,
      reference: invoiceId,
      status: invoiceId ? ("linked" as const) : ("pending" as const),
    },
    { key: "customer_payment", label: "Customer Payment", href: "/customer-statements", reference: null, status: "pending" as const },
  ];
}

async function enrichProductCosts(
  supabase: SupabaseClient,
  companyId: string,
  lines: SalesOrderLineInput[]
): Promise<SalesOrderLineInput[]> {
  const productIds = lines.map((line) => line.productId).filter(Boolean) as string[];
  if (!productIds.length) return lines;

  const { data, error } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, total_cost, selling_price")
    .eq("company_id", companyId)
    .in("id", productIds);
  if (error) throw new Error(error.message);

  const byId = new Map((data || []).map((row) => [String(row.id), row]));

  return lines.map((line) => {
    if (!line.productId) return line;
    const product = byId.get(line.productId);
    if (!product) return line;
    return {
      ...line,
      description: line.description || String(product.product_name || ""),
      costPerUnit: Number(line.costPerUnit || product.total_cost || 0),
      sellingPrice: Number(line.sellingPrice || product.selling_price || 0),
    };
  });
}

function ensureTransition(from: SalesOrderStatus, to: SalesOrderStatus) {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid transition from ${from} to ${to}.`);
  }
}

export async function listCustomerSalesOrders(
  supabase: SupabaseClient,
  companyId: string,
  filters?: { status?: string; search?: string; customerId?: string }
): Promise<SalesOrderRow[]> {
  let query = supabase
    .from("vyron_customer_sales_orders")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (filters?.status && filters.status !== "All") query = query.eq("status", filters.status);
  if (filters?.customerId) query = query.eq("customer_id", filters.customerId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data || []) as SalesOrderRow[];
  if (filters?.search) {
    const needle = filters.search.toLowerCase();
    rows = rows.filter((row) =>
      [row.order_number, row.customer_name, row.status, row.salesperson || "", row.warehouse || ""]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }
  return rows;
}

export async function getCustomerSalesOrder(
  supabase: SupabaseClient,
  companyId: string,
  id: string
): Promise<{ order: SalesOrderRow; lines: SalesOrderLineRow[] } | null> {
  const [{ data: order, error: orderError }, { data: lines, error: linesError }] = await Promise.all([
    supabase
      .from("vyron_customer_sales_orders")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("vyron_customer_sales_order_lines")
      .select("*")
      .eq("company_id", companyId)
      .eq("sales_order_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  if (orderError) throw new Error(orderError.message);
  if (linesError) throw new Error(linesError.message);
  if (!order) return null;

  return {
    order: order as SalesOrderRow,
    lines: (lines || []) as SalesOrderLineRow[],
  };
}

export async function saveCustomerSalesOrder(
  supabase: SupabaseClient,
  companyId: string,
  input: SalesOrderInput
): Promise<SalesOrderRow> {
  if (!input.customerName.trim()) throw new Error("Customer is required.");
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error("At least one line is required.");

  const enriched = await enrichProductCosts(supabase, companyId, input.lines);

  const mappedLines = enriched.map((line, index) => {
    const amounts = lineAmounts(line);
    return {
      id: line.id || randomUUID(),
      company_id: companyId,
      sales_order_id: input.id || "",
      product_id: line.productId || null,
      description: line.description || "Line",
      quantity: round4(Number(line.quantity || 0)),
      unit: line.unit || "each",
      selling_price: round4(Number(line.sellingPrice || 0)),
      discount_pct: round4(Number(line.discountPct || 0)),
      tax_rate: round4(Number(line.taxRate ?? 15)),
      line_total: amounts.total,
      cost_per_unit: round4(Number(line.costPerUnit || 0)),
      invoiced_qty: 0,
      sort_order: index,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  const totals = calculateSalesOrderTotals(enriched);
  const approvalRules = await evaluateApprovalRules(supabase, companyId, input, enriched, totals);

  const now = new Date().toISOString();

  if (!input.id) {
    const orderId = randomUUID();
    const { data: order, error: createError } = await supabase
      .from("vyron_customer_sales_orders")
      .insert({
        id: orderId,
        company_id: companyId,
        order_number: nextOrderNumber(),
        customer_id: input.customerId || null,
        customer_name: input.customerName.trim(),
        delivery_address: input.deliveryAddress?.trim() || null,
        contact_name: input.contactName?.trim() || null,
        salesperson: input.salesperson?.trim() || null,
        warehouse: input.warehouse?.trim() || null,
        status: "Draft",
        requested_delivery_date: input.requestedDeliveryDate || null,
        notes: input.notes?.trim() || null,
        subtotal: totals.subtotal,
        vat_amount: totals.vatAmount,
        total: totals.total,
        cost_value: totals.costValue,
        gross_profit: totals.grossProfit,
        gp_percentage: totals.gpPercentage,
        requires_approval: approvalRules.length > 0,
        approval_flags: approvalRules,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (createError) throw new Error(createError.message);

    const { error: lineError } = await supabase.from("vyron_customer_sales_order_lines").insert(
      mappedLines.map((line) => ({ ...line, sales_order_id: orderId }))
    );
    if (lineError) throw new Error(lineError.message);

    await writeSalesOrderAudit(supabase, {
      companyId,
      salesOrderId: orderId,
      eventType: "SALES_ORDER_CREATED",
      actor: "user",
      toStatus: "Draft",
      detail: `Sales order ${String(order.order_number || "") || orderId} created.`,
      metadata: { approvalRules },
    });

    return order as SalesOrderRow;
  }

  const { data: existing, error: existingError } = await supabase
    .from("vyron_customer_sales_orders")
    .select("status")
    .eq("company_id", companyId)
    .eq("id", input.id)
    .single();
  if (existingError) throw new Error(existingError.message);
  if (existing.status !== "Draft") throw new Error("Only Draft orders can be edited.");

  const { data: order, error: updateError } = await supabase
    .from("vyron_customer_sales_orders")
    .update({
      customer_id: input.customerId || null,
      customer_name: input.customerName.trim(),
      delivery_address: input.deliveryAddress?.trim() || null,
      contact_name: input.contactName?.trim() || null,
      salesperson: input.salesperson?.trim() || null,
      warehouse: input.warehouse?.trim() || null,
      requested_delivery_date: input.requestedDeliveryDate || null,
      notes: input.notes?.trim() || null,
      subtotal: totals.subtotal,
      vat_amount: totals.vatAmount,
      total: totals.total,
      cost_value: totals.costValue,
      gross_profit: totals.grossProfit,
      gp_percentage: totals.gpPercentage,
      requires_approval: approvalRules.length > 0,
      approval_flags: approvalRules,
      updated_at: now,
    })
    .eq("company_id", companyId)
    .eq("id", input.id)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);

  const { error: deleteError } = await supabase
    .from("vyron_customer_sales_order_lines")
    .delete()
    .eq("company_id", companyId)
    .eq("sales_order_id", input.id);
  if (deleteError) throw new Error(deleteError.message);

  const { error: lineError } = await supabase
    .from("vyron_customer_sales_order_lines")
    .insert(mappedLines.map((line) => ({ ...line, sales_order_id: input.id as string })));
  if (lineError) throw new Error(lineError.message);

  await writeSalesOrderAudit(supabase, {
    companyId,
    salesOrderId: String(input.id),
    eventType: "SALES_ORDER_UPDATED",
    actor: "user",
    fromStatus: "Draft",
    toStatus: "Draft",
    detail: `Sales order ${String(order.order_number || input.id)} updated.`,
    metadata: { approvalRules },
  });

  return order as SalesOrderRow;
}

async function checkAndReserveStock(
  supabase: SupabaseClient,
  companyId: string,
  order: SalesOrderRow,
  lines: SalesOrderLineRow[]
) {
  const pickingList = await buildPickingList(supabase, companyId, lines);
  const shortages = await buildSalesOrderShortages(supabase, companyId, pickingList);
  if (shortages.length) {
    const err = new Error("INSUFFICIENT_STOCK_FOR_APPROVAL") as Error & {
      code?: string;
      shortages?: SalesOrderStockShortage[];
    };
    err.code = "SALES_ORDER_STOCK_SHORTAGE";
    err.shortages = shortages;
    throw err;
  }

  const allocations = pickingList
    .filter((line) => line.product_id)
    .map((line) => {
      const available = Number(line.available_qty || 0);
      return {
      id: randomUUID(),
      company_id: companyId,
      sales_order_id: order.id,
      sales_order_line_id: line.sales_order_line_id,
      product_id: line.product_id,
      reserved_qty: Number(line.required_qty || 0),
      available_qty_snapshot: available,
      status: "Reserved",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    });

  await supabase
    .from("vyron_customer_sales_order_allocations")
    .delete()
    .eq("company_id", companyId)
    .eq("sales_order_id", order.id)
    .eq("status", "Reserved");

  const { error: allocError } = await supabase.from("vyron_customer_sales_order_allocations").insert(allocations);
  if (allocError) throw new Error(allocError.message);
}

export async function transitionCustomerSalesOrder(
  supabase: SupabaseClient,
  companyId: string,
  id: string,
  action: "submit" | "approve" | "start_picking" | "pack" | "dispatch" | "cancel",
  actor?: string
): Promise<SalesOrderRow> {
  const loaded = await getCustomerSalesOrder(supabase, companyId, id);
  if (!loaded) throw new Error("Sales order not found.");

  let toStatus = ACTION_STATUS[action];

  if (action === "submit") {
    const inputForRules: SalesOrderInput = {
      id: loaded.order.id,
      customerId: loaded.order.customer_id,
      customerName: loaded.order.customer_name,
      deliveryAddress: loaded.order.delivery_address || "",
      contactName: loaded.order.contact_name || "",
      salesperson: loaded.order.salesperson || "",
      warehouse: loaded.order.warehouse || "",
      requestedDeliveryDate: loaded.order.requested_delivery_date,
      notes: loaded.order.notes || "",
      lines: loaded.lines.map((line) => ({
        id: line.id,
        productId: line.product_id,
        description: line.description,
        quantity: Number(line.quantity || 0),
        unit: line.unit,
        sellingPrice: Number(line.selling_price || 0),
        discountPct: Number(line.discount_pct || 0),
        taxRate: Number(line.tax_rate || 15),
        costPerUnit: Number(line.cost_per_unit || 0),
      })),
    };
    const totals = calculateSalesOrderTotals(inputForRules.lines);
    const rules = await evaluateApprovalRules(supabase, companyId, inputForRules, inputForRules.lines, totals);

    if (rules.length === 0) {
      toStatus = "Approved";
      await checkAndReserveStock(supabase, companyId, loaded.order, loaded.lines);
    }

    const { error: rulePatchError } = await supabase
      .from("vyron_customer_sales_orders")
      .update({ requires_approval: rules.length > 0, approval_flags: rules, updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", id);
    if (rulePatchError) throw new Error(rulePatchError.message);
  }

  ensureTransition(loaded.order.status, toStatus);

  if (action === "approve") {
    await checkAndReserveStock(supabase, companyId, loaded.order, loaded.lines);
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: toStatus,
    updated_at: now,
  };
  if (action === "approve") {
    patch.approved_at = now;
    patch.approved_by = actor || "user";
  }
  if (action === "start_picking") patch.picked_at = now;
  if (action === "pack") patch.packed_at = now;
  if (action === "dispatch") patch.dispatched_at = now;
  if (action === "cancel") patch.cancelled_at = now;

  const { data, error } = await supabase
    .from("vyron_customer_sales_orders")
    .update(patch)
    .eq("company_id", companyId)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeSalesOrderAudit(supabase, {
    companyId,
    salesOrderId: id,
    eventType: `SALES_ORDER_${action.toUpperCase()}`,
    actor,
    fromStatus: loaded.order.status,
    toStatus,
    detail: `Sales order ${loaded.order.order_number} moved from ${loaded.order.status} to ${toStatus}.`,
  });

  return data as SalesOrderRow;
}

export async function getSalesOrderInsight(
  supabase: SupabaseClient,
  companyId: string,
  id: string
): Promise<SalesOrderInsight | null> {
  const loaded = await getCustomerSalesOrder(supabase, companyId, id);
  if (!loaded) return null;

  const pickingList = await buildPickingList(supabase, companyId, loaded.lines);
  const shortages = await buildSalesOrderShortages(supabase, companyId, pickingList);
  const audits = await listSalesOrderAudit(supabase, companyId, id);

  const inputForRules: SalesOrderInput = {
    id: loaded.order.id,
    customerId: loaded.order.customer_id,
    customerName: loaded.order.customer_name,
    deliveryAddress: loaded.order.delivery_address || "",
    contactName: loaded.order.contact_name || "",
    salesperson: loaded.order.salesperson || "",
    warehouse: loaded.order.warehouse || "",
    requestedDeliveryDate: loaded.order.requested_delivery_date,
    notes: loaded.order.notes || "",
    lines: loaded.lines.map((line) => ({
      id: line.id,
      productId: line.product_id,
      description: line.description,
      quantity: Number(line.quantity || 0),
      unit: line.unit,
      sellingPrice: Number(line.selling_price || 0),
      discountPct: Number(line.discount_pct || 0),
      taxRate: Number(line.tax_rate || 15),
      costPerUnit: Number(line.cost_per_unit || 0),
    })),
  };
  const totals = calculateSalesOrderTotals(inputForRules.lines);
  const approvalRules = await evaluateApprovalRules(supabase, companyId, inputForRules, inputForRules.lines, totals);
  const manufacturing = await buildManufacturingInsight(supabase, companyId, shortages);
  const procurement = await buildProcurementInsight(supabase, companyId, shortages);
  const ai = buildAiCommercialInsight(loaded.order, approvalRules, shortages, procurement.estimatedCost);
  const timeline = buildWorkflowTimeline(audits);
  const traceability = await buildTraceability(supabase, companyId, loaded.order);

  return {
    order: loaded.order,
    lines: loaded.lines,
    picking_list: pickingList,
    shortages,
    manufacturing,
    procurement,
    ai,
    timeline,
    traceability,
    approval_rules: approvalRules,
    requires_approval: approvalRules.length > 0,
    audits,
  };
}

export async function createProductionRunsForSalesOrder(
  supabase: SupabaseClient,
  companyId: string,
  salesOrderId: string,
  actor = "user"
) {
  const insight = await getSalesOrderInsight(supabase, companyId, salesOrderId);
  if (!insight) throw new Error("Sales order not found.");

  const buildable = insight.shortages.filter((row) => row.linked_bom_id && row.shortfall_qty > 0);
  if (!buildable.length) {
    throw new Error("No finished-good shortages with linked BOMs available for production runs.");
  }

  const runs = [];
  for (const shortage of buildable) {
    const run = await createProductionRun(supabase, companyId, {
      bom_id: String(shortage.linked_bom_id),
      product_id: shortage.product_id,
      planned_qty: shortage.shortfall_qty,
      notes: `Generated from Sales Order ${insight.order.order_number} due to stock shortfall.`,
      created_by: actor,
    });
    runs.push(run);

    await supabase.from("vyron_customer_sales_order_production_links").insert({
      id: randomUUID(),
      company_id: companyId,
      sales_order_id: salesOrderId,
      production_run_id: run.id,
      created_at: new Date().toISOString(),
    });
  }

  await writeSalesOrderAudit(supabase, {
    companyId,
    salesOrderId,
    eventType: "PRODUCTION_RUNS_CREATED",
    actor,
    detail: `Created ${runs.length} production run(s) from shortages.`,
    metadata: {
      runNumbers: runs.map((run) => run.run_number),
      runIds: runs.map((run) => run.id),
    },
  });

  return { order: insight.order, runs };
}

export async function generateProcurementRequisitionForSalesOrder(
  supabase: SupabaseClient,
  companyId: string,
  salesOrderId: string,
  actor = "user"
): Promise<{ order: SalesOrderRow; requisition: ProcurementRequisitionRow }> {
  const insight = await getSalesOrderInsight(supabase, companyId, salesOrderId);
  if (!insight) throw new Error("Sales order not found.");

  const ingredientLines = await buildIngredientShortageLines(supabase, companyId, insight.shortages);
  if (!ingredientLines.length) {
    throw new Error("No ingredient shortages found from current sales-order shortfalls.");
  }

  const requisition = await createProcurementRequisition(supabase, companyId, {
    created_by: actor,
    source: "manual",
    notes: `Generated from Sales Order ${insight.order.order_number} shortages.`,
    lines: ingredientLines,
  });

  await supabase.from("vyron_customer_sales_order_requisition_links").insert({
    id: randomUUID(),
    company_id: companyId,
    sales_order_id: salesOrderId,
    requisition_id: requisition.id,
    created_at: new Date().toISOString(),
  });

  await writeSalesOrderAudit(supabase, {
    companyId,
    salesOrderId,
    eventType: "PROCUREMENT_REQUISITION_CREATED",
    actor,
    detail: `Generated procurement requisition ${requisition.requisition_number}.`,
    metadata: {
      requisitionId: requisition.id,
      requisitionNumber: requisition.requisition_number,
      lineCount: requisition.lines?.length || ingredientLines.length,
    },
  });

  return { order: insight.order, requisition };
}

export async function convertSalesOrderToInvoice(
  supabase: SupabaseClient,
  companyId: string,
  id: string,
  actor?: string
): Promise<{ order: SalesOrderRow; invoice: CustomerInvoiceRow }> {
  const loaded = await getCustomerSalesOrder(supabase, companyId, id);
  if (!loaded) throw new Error("Sales order not found.");
  if (!["Dispatched", "Partially Invoiced"].includes(loaded.order.status)) {
    throw new Error("Only Dispatched or Partially Invoiced orders can be converted.");
  }

  const invoiceLines = loaded.lines
    .map((line) => {
      const remaining = Number(line.quantity || 0) - Number(line.invoiced_qty || 0);
      if (remaining <= 0) return null;
      return {
        productId: line.product_id,
        productName: line.description,
        quantity: remaining,
        sellingPrice: Number(line.selling_price || 0),
        costPerUnit: Number(line.cost_per_unit || 0),
      };
    })
    .filter(Boolean) as Array<{ productId: string | null; productName: string; quantity: number; sellingPrice: number; costPerUnit: number }>;

  if (!invoiceLines.length) throw new Error("No remaining quantities to invoice.");

  const invoice = await createCustomerInvoice(supabase, companyId, {
    customerId: loaded.order.customer_id,
    customerName: loaded.order.customer_name,
    notes: `Converted from Sales Order ${loaded.order.order_number}${actor ? ` by ${actor}` : ""}`,
    lines: invoiceLines,
  });

  for (const line of loaded.lines) {
    const remaining = Number(line.quantity || 0) - Number(line.invoiced_qty || 0);
    if (remaining <= 0) continue;
    const { error } = await supabase
      .from("vyron_customer_sales_order_lines")
      .update({
        invoiced_qty: Number(line.quantity || 0),
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("id", line.id);
    if (error) throw new Error(error.message);
  }

  const { error: linkError } = await supabase.from("vyron_customer_sales_order_invoice_links").insert({
    id: randomUUID(),
    company_id: companyId,
    sales_order_id: loaded.order.id,
    invoice_id: invoice.id,
    created_at: new Date().toISOString(),
  });
  if (linkError) throw new Error(linkError.message);

  const latest = await getCustomerSalesOrder(supabase, companyId, id);
  if (!latest) throw new Error("Sales order not found after conversion.");

  const fullyInvoiced = latest.lines.every((line) => Number(line.invoiced_qty || 0) >= Number(line.quantity || 0));
  const { data: order, error: statusError } = await supabase
    .from("vyron_customer_sales_orders")
    .update({
      status: fullyInvoiced ? "Invoiced" : "Partially Invoiced",
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("id", id)
    .select("*")
    .single();
  if (statusError) throw new Error(statusError.message);

  if (fullyInvoiced) {
    await supabase
      .from("vyron_customer_sales_order_allocations")
      .update({ status: "Converted", updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("sales_order_id", id)
      .eq("status", "Reserved");
  }

  await writeSalesOrderAudit(supabase, {
    companyId,
    salesOrderId: id,
    eventType: "CONVERTED_TO_INVOICE",
    actor,
    fromStatus: loaded.order.status,
    toStatus: fullyInvoiced ? "Invoiced" : "Partially Invoiced",
    detail: `Converted to invoice ${invoice.invoice_number}.`,
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
    },
  });

  return { order: order as SalesOrderRow, invoice };
}

export async function getCustomerCommercialKpis(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string
): Promise<CustomerCommercialKpis> {
  const [{ data: invoices, error: invoiceError }, { data: orders, error: orderError }] = await Promise.all([
    supabase
      .from("vyron_customer_invoices")
      .select("sales_value, gross_profit, status, invoice_date, updated_at")
      .eq("company_id", companyId)
      .eq("customer_id", customerId),
    supabase
      .from("vyron_customer_sales_orders")
      .select("total, status")
      .eq("company_id", companyId)
      .eq("customer_id", customerId),
  ]);
  if (invoiceError) throw new Error(invoiceError.message);
  if (orderError) throw new Error(orderError.message);

  const invoiceRows = invoices || [];
  const orderRows = orders || [];

  const revenue = round2(
    invoiceRows
      .filter((invoice) => String(invoice.status || "") !== "Cancelled")
      .reduce((sum, invoice) => sum + Number(invoice.sales_value || 0), 0)
  );
  const gp = round2(
    invoiceRows
      .filter((invoice) => String(invoice.status || "") !== "Cancelled")
      .reduce((sum, invoice) => sum + Number(invoice.gross_profit || 0), 0)
  );
  const outstandingOrders = round2(
    orderRows
      .filter((order) => !["Invoiced", "Cancelled"].includes(String(order.status || "")))
      .reduce((sum, order) => sum + Number(order.total || 0), 0)
  );
  const outstandingInvoices = round2(
    invoiceRows
      .filter((invoice) => !["Paid", "Cancelled"].includes(String(invoice.status || "")))
      .reduce((sum, invoice) => sum + Number(invoice.sales_value || 0), 0)
  );

  const paidDays = invoiceRows
    .filter((invoice) => String(invoice.status || "") === "Paid" && invoice.invoice_date && invoice.updated_at)
    .map((invoice) => daysBetween(String(invoice.invoice_date), String(invoice.updated_at)));

  const averagePaymentDays = paidDays.length
    ? round2(paidDays.reduce((sum, days) => sum + Number(days || 0), 0) / paidDays.length)
    : 0;

  return {
    revenue,
    gp,
    outstandingOrders,
    outstandingInvoices,
    averagePaymentDays,
    lifetimeValue: revenue,
  };
}

export function salesOrderKpis(orders: SalesOrderRow[]) {
  const today = new Date().toISOString().slice(0, 10);
  const ordersToday = orders.filter((row) => row.created_at?.slice(0, 10) === today);
  const revenueToday = ordersToday.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const gpToday = ordersToday.reduce((sum, row) => sum + Number(row.gross_profit || 0), 0);

  return {
    draftOrders: orders.filter((row) => row.status === "Draft").length,
    awaitingApproval: orders.filter((row) => row.status === "Awaiting Approval").length,
    readyToPick: orders.filter((row) => row.status === "Approved").length,
    waitingForDispatch: orders.filter((row) => row.status === "Packed").length,
    readyToInvoice: orders.filter((row) => row.status === "Dispatched" || row.status === "Partially Invoiced").length,
    ordersToday: ordersToday.length,
    revenueToday,
    gpToday,
    manufacturingRequired: orders.filter((row) => !["Invoiced", "Cancelled"].includes(row.status) && Number(row.cost_value || 0) > Number(row.subtotal || 0) * 0.8).length,
    procurementRequired: orders.filter((row) => !["Invoiced", "Cancelled"].includes(row.status) && Number(row.gp_percentage || 0) < 20).length,
  };
}

export async function getCustomerIntelligence(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string
): Promise<CustomerIntelligence> {
  const [{ data: invoices, error: invoiceError }, { data: orderHeaders, error: orderError }] = await Promise.all([
    supabase
      .from("vyron_customer_invoices")
      .select("id, invoice_date, updated_at, sales_value, gross_profit, status")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .order("invoice_date", { ascending: true }),
    supabase
      .from("vyron_customer_sales_orders")
      .select("id, created_at, total")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true }),
  ]);
  if (invoiceError) throw new Error(invoiceError.message);
  if (orderError) throw new Error(orderError.message);

  const invoiceRows = invoices || [];
  const orderRows = orderHeaders || [];
  const invoiceIds = invoiceRows.map((row) => String(row.id));

  const { data: invoiceLines, error: lineError } = invoiceIds.length
    ? await supabase
        .from("vyron_customer_invoice_lines")
        .select("invoice_id, product_name, quantity, selling_price")
        .in("invoice_id", invoiceIds)
    : { data: [], error: null };
  if (lineError) throw new Error(lineError.message);

  const lifetimeValue = round2(invoiceRows.reduce((sum, row) => sum + Number(row.sales_value || 0), 0));
  const totalGp = round2(invoiceRows.reduce((sum, row) => sum + Number(row.gross_profit || 0), 0));
  const averageGpPct = lifetimeValue > 0 ? round2((totalGp / lifetimeValue) * 100) : 0;

  const avgOrderSize =
    orderRows.length > 0
      ? round2(orderRows.reduce((sum, row) => sum + Number(row.total || 0), 0) / orderRows.length)
      : 0;

  let purchaseFrequencyDays = 0;
  if (orderRows.length > 1) {
    let totalGap = 0;
    for (let i = 1; i < orderRows.length; i++) {
      totalGap += daysBetween(String(orderRows[i - 1].created_at), String(orderRows[i].created_at));
    }
    purchaseFrequencyDays = round2(totalGap / (orderRows.length - 1));
  }

  const paidDays = invoiceRows
    .filter((row) => String(row.status || "") === "Paid" && row.invoice_date && row.updated_at)
    .map((row) => daysBetween(String(row.invoice_date), String(row.updated_at)));
  const averagePaymentDays = paidDays.length
    ? round2(paidDays.reduce((sum, days) => sum + days, 0) / paidDays.length)
    : 0;

  const latePaymentRisk: "Low" | "Medium" | "High" =
    averagePaymentDays > 30 ? "High" : averagePaymentDays > 14 ? "Medium" : "Low";

  const byProduct = new Map<string, number>();
  for (const line of invoiceLines || []) {
    const name = String(line.product_name || "Product");
    const value = Number(line.quantity || 0) * Number(line.selling_price || 0);
    byProduct.set(name, round2((byProduct.get(name) || 0) + value));
  }

  const mostPurchasedProducts = [...byProduct.entries()]
    .map(([productName, revenue]) => ({ productName, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const predictedNextOrderDate =
    orderRows.length > 0 && purchaseFrequencyDays > 0
      ? new Date(
          new Date(String(orderRows[orderRows.length - 1].created_at)).getTime() +
            purchaseFrequencyDays * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .slice(0, 10)
      : null;

  return {
    lifetimeValue,
    averageGpPct,
    latePaymentRisk,
    averageOrderSize: avgOrderSize,
    purchaseFrequencyDays,
    mostPurchasedProducts,
    predictedNextOrderDate,
  };
}
