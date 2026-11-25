import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerSalesOrder } from "@/lib/vyron-customer-sales-orders";
import { getStoreOrderDetail } from "@/lib/vyron-store-orders";
import { getBomCompletenessReport, type BomCompletenessRow } from "@/lib/vyron-bom-completeness";
import { explodeForProduction, loadBomSource, scaleBomRequirements } from "@/lib/vyron-manufacturing";
import { JOB_CARD_SERIES, nextDocumentNumber } from "@/lib/vyron-document-numbering";

/**
 * Production Job Cards for received orders.
 *
 * WHICH ORDERS. Handcrafted receives orders as Customer Sales Orders (the
 * single sales-order engine also used by the Order Centre and the customer
 * ordering portal). Internal Store Orders are the other order type a
 * production kitchen receives. Order Inbox intakes are NOT eligible: until
 * confirmed they are not orders, and once confirmed they ARE sales orders.
 *
 * WHAT A JOB CARD IS. A production instruction linked to its original order:
 * one card per order (a reprint keeps the same number), numbered from the
 * controlled job_card series. Printing never creates an order and never
 * changes an order quantity — the order is only read.
 *
 * INGREDIENTS are listed only from a BOM the system can use, scaled exactly as
 * a production run scales it (order qty ÷ BOM yield, Sub-BOMs expanded). When
 * no usable BOM exists the card says so and lists nothing — no quantity is
 * ever invented.
 */

export type JobCardSourceType = "customer_sales_order" | "store_order";
export const JOB_CARD_STATUSES = ["Awaiting Production", "In Production", "Completed", "On Hold"] as const;
export type JobCardStatus = (typeof JOB_CARD_STATUSES)[number];

const INELIGIBLE: Record<JobCardSourceType, Set<string>> = {
  customer_sales_order: new Set(["Draft", "Cancelled"]),
  store_order: new Set(["Draft", "Cancelled"]),
};

export class JobCardError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "JobCardError";
    this.status = status;
  }
}

export type JobCardRecord = {
  id: string;
  jobCardNumber: string;
  status: JobCardStatus;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  printCount: number;
  createdAt: string;
  createdBy: string;
};

export type JobCardIngredient = {
  lineType: string;
  name: string;
  ingredientId: string | null;
  quantity: number;
  unit: string;
};

export type JobCardItem = {
  productId: string | null;
  productName: string;
  itemCode: string | null;
  quantity: number;
  unit: string;
  bomReference: string | null;
  bomStatus: string;
  bomClassification: "VERIFIED_COMPLETE" | "INCOMPLETE" | "OVERRIDDEN" | "NO_PRODUCT";
  /** Null when no usable BOM: the card prints the reason instead of quantities. */
  ingredients: JobCardIngredient[] | null;
  bomWarning: string | null;
};

export type JobCardDocument = {
  card: JobCardRecord;
  sourceType: JobCardSourceType;
  sourceId: string;
  orderNumber: string;
  orderStatus: string;
  customerName: string | null;
  customerLabel: string;
  orderReceivedDate: string | null;
  requiredDate: string | null;
  specialInstructions: string | null;
  items: JobCardItem[];
};

const isMissingTable = (message: string) => /vyron_production_job_cards/.test(message) && /does not exist|could not find|schema cache/i.test(message);

type LoadedOrder = {
  orderNumber: string;
  status: string;
  customerName: string | null;
  customerLabel: string;
  received: string | null;
  required: string | null;
  notes: string | null;
  lines: { productId: string | null; description: string; quantity: number; unit: string }[];
};

async function loadOrder(supabase: SupabaseClient, companyId: string, type: JobCardSourceType, id: string): Promise<LoadedOrder | null> {
  if (type === "customer_sales_order") {
    const loaded = await getCustomerSalesOrder(supabase, companyId, id);
    if (!loaded) return null;
    const { order, lines } = loaded;
    return {
      orderNumber: String(order.order_number),
      status: String(order.status),
      customerName: order.customer_name || null,
      customerLabel: "Customer",
      received: order.created_at || null,
      required: order.requested_delivery_date || null,
      notes: order.notes || null,
      lines: lines.map((l) => ({
        productId: l.product_id,
        description: l.description,
        quantity: Number(l.quantity || 0),
        unit: l.unit || "each",
      })),
    };
  }
  const order = await getStoreOrderDetail(supabase, companyId, id);
  if (!order) return null;
  const store = order as unknown as { store_name_snapshot?: string | null; store_code_snapshot?: string | null };
  return {
    orderNumber: String(order.order_number),
    status: String(order.status),
    customerName: store.store_name_snapshot || null,
    customerLabel: "Store",
    received: order.submitted_at || order.order_date || null,
    required: order.required_date || null,
    notes: order.notes || null,
    lines: (order.lines || []).map((l) => ({
      productId: l.product_id || null,
      description: l.product_name_snapshot,
      quantity: Number(l.quantity || 0),
      unit: l.unit || "each",
    })),
  };
}

function toRecord(r: Record<string, unknown>): JobCardRecord {
  return {
    id: String(r.id),
    jobCardNumber: String(r.job_card_number),
    status: String(r.status) as JobCardStatus,
    statusChangedAt: (r.status_changed_at as string) ?? null,
    statusChangedBy: (r.status_changed_by as string) ?? null,
    printCount: Number(r.print_count || 0),
    createdAt: String(r.created_at),
    createdBy: String(r.created_by),
  };
}

export async function findJobCard(supabase: SupabaseClient, companyId: string, type: JobCardSourceType, sourceId: string) {
  const { data, error } = await supabase
    .from("vyron_production_job_cards")
    .select("*")
    .eq("company_id", companyId)
    .eq("source_type", type)
    .eq("source_id", sourceId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message) || error.code === "PGRST205") {
      throw new JobCardError("Job cards are not installed in this database yet (the job card table is missing).", 503);
    }
    throw new Error(error.message);
  }
  return data ? toRecord(data) : null;
}

/** The order's job card, created (and numbered) on first request. Never touches the order. */
async function ensureJobCard(
  supabase: SupabaseClient,
  companyId: string,
  type: JobCardSourceType,
  sourceId: string,
  orderNumber: string,
  actor: string
): Promise<JobCardRecord> {
  const existing = await findJobCard(supabase, companyId, type, sourceId);
  if (existing) return existing;
  const id = randomUUID();
  const number = await nextDocumentNumber(supabase, {
    companyId,
    seriesKey: JOB_CARD_SERIES,
    defaultPrefix: "JC-",
    documentType: "job_card",
    documentId: id,
    actor,
  });
  const { data, error } = await supabase
    .from("vyron_production_job_cards")
    .insert({
      id,
      company_id: companyId,
      job_card_number: number,
      source_type: type,
      source_id: sourceId,
      source_number: orderNumber,
      created_by: actor,
    })
    .select("*")
    .single();
  if (error) {
    // Another user created this order's card at the same moment: use theirs.
    if (error.code === "23505") {
      const winner = await findJobCard(supabase, companyId, type, sourceId);
      if (winner) return winner;
    }
    throw new Error(`The job card could not be created: ${error.message}`);
  }
  await supabase.from("vyron_inventory_audit_log").insert({
    company_id: companyId,
    stock_item_id: null,
    event_type: "job_card_created",
    actor,
    field_name: "job_card",
    old_value: null,
    new_value: number,
    detail: `Job card ${number} issued for ${type === "customer_sales_order" ? "sales order" : "store order"} ${orderNumber}. The order was not changed.`,
    reference_type: type,
    reference_id: sourceId,
    metadata: { jobCardId: id, at: new Date().toISOString() },
  });
  return toRecord(data);
}

async function productCodes(supabase: SupabaseClient, companyId: string, productIds: string[]) {
  const codes = new Map<string, string>();
  if (!productIds.length) return codes;
  const { data } = await supabase.from("vyron_cost_products").select("id, sku").eq("company_id", companyId).in("id", productIds);
  for (const p of data || []) if (p.sku && String(p.sku).trim()) codes.set(String(p.id), String(p.sku).trim());
  const missing = productIds.filter((id) => !codes.has(id));
  if (missing.length) {
    const { data: maps } = await supabase
      .from("vyron_customer_item_mappings")
      .select("product_id, source_item_code")
      .eq("company_id", companyId)
      .in("product_id", missing);
    for (const m of maps || []) {
      const code = String(m.source_item_code || "").trim();
      if (code && !codes.has(String(m.product_id))) codes.set(String(m.product_id), code);
    }
  }
  return codes;
}

async function ingredientsFor(
  supabase: SupabaseClient,
  companyId: string,
  row: BomCompletenessRow,
  orderQty: number
): Promise<JobCardIngredient[] | null> {
  if (!row.bomId || !row.usableBom) return null;
  const source = await loadBomSource(supabase, companyId, row.bomId);
  if (!source) return null;
  const yieldQty = Math.max(0.0001, Number(source.bom.yield_qty || 1));
  const lines = source.fromRecipe ? source.lines : await explodeForProduction(supabase, companyId, source.bom.id, source.lines);
  return scaleBomRequirements(lines, orderQty / yieldQty).map((l) => ({
    lineType: l.line_type,
    name: l.line_name,
    ingredientId: l.ingredient_id,
    quantity: l.planned_qty,
    unit: l.unit,
  }));
}

export async function buildJobCardDocuments(
  supabase: SupabaseClient,
  companyId: string,
  type: JobCardSourceType,
  sourceIds: string[],
  actor: string
): Promise<{ documents: JobCardDocument[]; skipped: { id: string; reason: string }[] }> {
  const ids = [...new Set(sourceIds.map((s) => String(s).trim()).filter(Boolean))].slice(0, 100);
  if (!ids.length) throw new JobCardError("Choose at least one order.");
  const skipped: { id: string; reason: string }[] = [];
  const orders: { id: string; order: LoadedOrder }[] = [];
  for (const id of ids) {
    const order = await loadOrder(supabase, companyId, type, id);
    if (!order) {
      skipped.push({ id, reason: "Order not found in this company." });
      continue;
    }
    if (INELIGIBLE[type].has(order.status)) {
      skipped.push({ id, reason: `${order.orderNumber} is ${order.status} — job cards are printed for received orders only.` });
      continue;
    }
    orders.push({ id, order });
  }
  if (!orders.length) return { documents: [], skipped };

  const report = await getBomCompletenessReport(supabase, companyId);
  const rowByProduct = new Map(report.rows.map((r) => [r.productId, r]));
  const codes = await productCodes(
    supabase,
    companyId,
    [...new Set(orders.flatMap((o) => o.order.lines.map((l) => l.productId).filter(Boolean) as string[]))]
  );

  const documents: JobCardDocument[] = [];
  for (const { id, order } of orders) {
    const card = await ensureJobCard(supabase, companyId, type, id, order.orderNumber, actor);
    const items: JobCardItem[] = [];
    for (const line of order.lines) {
      const row = line.productId ? rowByProduct.get(line.productId) : undefined;
      if (!line.productId || !row) {
        items.push({
          productId: line.productId,
          productName: line.description,
          itemCode: line.productId ? codes.get(line.productId) ?? null : null,
          quantity: line.quantity,
          unit: line.unit,
          bomReference: null,
          bomStatus: line.productId ? "PRODUCT NOT ACTIVE" : "NO PRODUCT",
          bomClassification: "NO_PRODUCT",
          ingredients: null,
          bomWarning: line.productId
            ? "The product on this line is archived or not an active finished good, so no BOM is used."
            : "This order line is not linked to a product, so no BOM can be used.",
        });
        continue;
      }
      const ingredients = await ingredientsFor(supabase, companyId, row, line.quantity);
      let bomWarning: string | null = null;
      if (!ingredients) {
        bomWarning = `No usable BOM — ingredients are not listed. ${row.classificationReason}`;
      } else if (row.classification === "OVERRIDDEN") {
        bomWarning = `BOM classification was manually overridden by ${row.override?.createdBy} (system status ${row.bomStatus}). Check the listed quantities before production.`;
      } else if (row.bomStatus !== "COMPLETE") {
        bomWarning = `BOM is ${row.bomStatus}: ${row.exceptions.find((e) => e.drivesClassification)?.message ?? row.classificationReason}`;
      } else if (row.bomIsDraft) {
        bomWarning = "BOM is a Draft, not Approved.";
      }
      items.push({
        productId: line.productId,
        productName: row.productName || line.description,
        itemCode: row.productCode ?? codes.get(line.productId) ?? null,
        quantity: line.quantity,
        unit: line.unit,
        bomReference: row.bomId ? `${row.bomName ?? "BOM"} (${row.bomRecordStatus ?? "no status"})` : null,
        bomStatus: row.bomStatus,
        bomClassification: row.classification,
        ingredients,
        bomWarning,
      });
    }
    documents.push({
      card,
      sourceType: type,
      sourceId: id,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      customerName: order.customerName,
      customerLabel: order.customerLabel,
      orderReceivedDate: order.received,
      requiredDate: order.required,
      specialInstructions: order.notes,
      items,
    });
  }
  return { documents, skipped };
}

/** Record that cards were printed (count + who/when). Never fails the print. */
export async function recordJobCardsPrinted(supabase: SupabaseClient, companyId: string, cards: JobCardRecord[], actor: string) {
  const at = new Date().toISOString();
  for (const c of cards) {
    await supabase
      .from("vyron_production_job_cards")
      .update({ print_count: c.printCount + 1, last_printed_at: at, last_printed_by: actor })
      .eq("id", c.id)
      .eq("company_id", companyId);
  }
}

export async function setJobCardStatus(
  supabase: SupabaseClient,
  companyId: string,
  jobCardId: string,
  status: string,
  actor: string
): Promise<JobCardRecord> {
  if (!(JOB_CARD_STATUSES as readonly string[]).includes(status)) throw new JobCardError("Unknown job card status.");
  const { data: current, error: readError } = await supabase
    .from("vyron_production_job_cards")
    .select("*")
    .eq("id", jobCardId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!current) throw new JobCardError("Job card not found.", 404);
  if (current.status === status) return toRecord(current);
  const at = new Date().toISOString();
  const { data, error } = await supabase
    .from("vyron_production_job_cards")
    .update({ status, status_changed_at: at, status_changed_by: actor })
    .eq("id", jobCardId)
    .eq("company_id", companyId)
    .eq("status", current.status)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new JobCardError("The job card status was changed by someone else. Refresh and try again.", 409);
  await supabase.from("vyron_inventory_audit_log").insert({
    company_id: companyId,
    stock_item_id: null,
    event_type: "job_card_status_changed",
    actor,
    field_name: "status",
    old_value: current.status,
    new_value: status,
    detail: `Job card ${current.job_card_number} (${current.source_number ?? current.source_id}): ${current.status} -> ${status}. The order was not changed.`,
    reference_type: current.source_type,
    reference_id: current.source_id,
    metadata: { jobCardId, at },
  });
  return toRecord(data);
}
