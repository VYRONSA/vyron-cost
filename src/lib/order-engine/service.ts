import { randomBytes, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDefaultVatRate } from "@/lib/vyron-customer-invoices";
import { saveCustomerSalesOrder, writeSalesOrderAudit } from "@/lib/vyron-customer-sales-orders";
import { OrderEngineError, isMissingRelation, isUniqueViolation, raiseDbError } from "@/lib/order-engine/errors";
import {
  ACTION_FROM,
  ACTION_REQUIRES_REASON,
  deriveApprovalStatus,
  deriveFulfilmentStatus,
  deriveInvoiceStatus,
  isEditable,
  type IntakeAction,
} from "@/lib/order-engine/lifecycle";
import { aliasKeyFor, identityKeyFor, loadProductsById } from "@/lib/order-engine/matching";
import { candidateContentHash, cleanText, round4, stableHash, toIsoDateOrNull } from "@/lib/order-engine/normalize";
import { emitOrderIntakeNotification, type OrderIntakeEvent } from "@/lib/order-engine/notifications";
import { recordOrderEngineEvent } from "@/lib/order-engine/telemetry";
import type {
  IntakeEventRow,
  IntakeLineRow,
  IntakeRow,
  IntakeSourceSnapshot,
  IntakeStatus,
  LineSourceSnapshot,
  OrderCandidate,
  OrderCandidateLine,
  OrderContext,
  OrderEngineActor,
  ValidationSnapshot,
} from "@/lib/order-engine/types";
import { ORDER_CONTEXTS, ORDER_SOURCES } from "@/lib/order-engine/types";
import { loadValidationContext, runValidators } from "@/lib/order-engine/validation";

/**
 * The Order Engine service. Every function takes the company id resolved from
 * the verified session and filters every read and write by it. Nothing here
 * posts stock, invoices, accounting or e-mail: the only write outside the
 * intake tables is the Draft sales order created on approval, through the
 * existing engine's own saveCustomerSalesOrder.
 */

const MAX_LINES = 500;
const T_INTAKES = "vyron_order_intakes";
const T_LINES = "vyron_order_intake_lines";
const T_EVENTS = "vyron_order_intake_events";

// ---------------------------------------------------------------------------
// Candidate checking (anything from a source or a browser is untrusted)
// ---------------------------------------------------------------------------

function assertCandidate(candidate: OrderCandidate): void {
  if (!candidate || typeof candidate !== "object") throw new OrderEngineError("INVALID_INPUT", "An order is required.");
  if (!ORDER_SOURCES.includes(candidate.source)) throw new OrderEngineError("INVALID_INPUT", `Unknown order source "${String(candidate.source)}".`);
  // Historical sales (e.g. Metorik / WooCommerce history) are external sales
  // intelligence. They are never turned into orders to fulfil here.
  if (candidate.purpose === "historical") {
    throw new OrderEngineError(
      "INVALID_INPUT",
      "Historical orders are not order intake. They stay in external sales history unless converted through a controlled process."
    );
  }
  if (candidate.context && !ORDER_CONTEXTS.includes(candidate.context)) {
    throw new OrderEngineError("INVALID_INPUT", `Unknown order context "${String(candidate.context)}".`);
  }
  if (candidate.source !== "manual" && !cleanText(candidate.sourceKey)) {
    throw new OrderEngineError("INVALID_INPUT", `A ${candidate.source} order must carry its source identity (source key).`);
  }
  if (!Array.isArray(candidate.lines) || candidate.lines.length === 0) {
    throw new OrderEngineError("INVALID_INPUT", "An order needs at least one line.");
  }
  if (candidate.lines.length > MAX_LINES) {
    throw new OrderEngineError("INVALID_INPUT", `An order may have at most ${MAX_LINES} lines.`);
  }
  const refs = new Set<string>();
  candidate.lines.forEach((line, index) => {
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity)) throw new OrderEngineError("INVALID_INPUT", `Line ${index + 1}: quantity is not a number.`);
    for (const [label, value] of [
      ["unit price", line.unitPrice],
      ["discount", line.discountAmount],
      ["tax", line.taxAmount],
      ["line total", line.lineTotal],
    ] as const) {
      if (value !== null && value !== undefined && !Number.isFinite(Number(value))) {
        throw new OrderEngineError("INVALID_INPUT", `Line ${index + 1}: ${label} is not a number.`);
      }
    }
    if (!cleanText(line.sku) && !cleanText(line.description) && !line.productId) {
      throw new OrderEngineError("INVALID_INPUT", `Line ${index + 1} has no SKU, description or product.`);
    }
    const ref = cleanText(line.sourceLineReference);
    if (ref) {
      if (refs.has(ref)) throw new OrderEngineError("INVALID_INPUT", `Line reference "${ref}" appears twice in one order.`);
      refs.add(ref);
    }
  });
  for (const [label, value] of [
    ["order date", candidate.orderDate],
    ["requested delivery date", candidate.requestedDeliveryDate],
  ] as const) {
    if (value && !toIsoDateOrNull(value)) throw new OrderEngineError("INVALID_INPUT", `The ${label} must be a YYYY-MM-DD date.`);
  }
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The line exactly as the source stated it — frozen at receipt. */
export function lineSourceSnapshot(line: OrderCandidateLine): LineSourceSnapshot {
  const written = line.sourceValues || {};
  const asWritten: NonNullable<LineSourceSnapshot["as_written"]> = {};
  if (written.quantity !== undefined) asWritten.quantity = String(written.quantity).slice(0, 60);
  if (written.price !== undefined) asWritten.price = String(written.price).slice(0, 60);
  return {
    ...(Object.keys(asWritten).length ? { as_written: asWritten } : {}),
    source_sku: written.sku !== undefined ? cleanText(written.sku, 200) : cleanText(line.sku, 200),
    source_product_name: written.productName !== undefined ? cleanText(written.productName, 500) : cleanText(line.description, 500),
    source_external_product_id: cleanText(line.externalProductId, 200),
    source_quantity: round4(Number(line.quantity)),
    source_unit: cleanText(line.unit, 40),
    source_price: numOrNull(line.unitPrice),
    source_discount: numOrNull(line.discountAmount),
    source_tax: numOrNull(line.taxAmount),
    source_line_total: numOrNull(line.lineTotal),
  };
}

/** The header exactly as the source stated it — frozen at receipt. */
export function intakeSourceSnapshot(candidate: OrderCandidate): IntakeSourceSnapshot {
  return {
    customer_name: cleanText(candidate.customerName, 300),
    customer_reference: cleanText(candidate.customerReference ?? candidate.senderEmail, 300),
    external_customer_id: cleanText(candidate.externalCustomerId, 200),
    catalog_system: cleanText(candidate.catalogSystem, 120),
    po_number: cleanText(candidate.customerPoNumber, 120),
    external_order_number: cleanText(candidate.externalOrderNumber, 120),
    source_order_reference: cleanText(candidate.sourceReference, 300),
    requested_delivery_date: candidate.requestedDeliveryDate ? String(candidate.requestedDeliveryDate) : null,
    delivery_address: cleanText(candidate.deliveryAddress, 1000),
    currency: cleanText(candidate.currency, 10),
    prices_include_tax: typeof candidate.pricesIncludeTax === "boolean" ? candidate.pricesIncludeTax : null,
    supplied: {
      subtotal: numOrNull(candidate.supplied?.subtotal),
      discount_total: numOrNull(candidate.supplied?.discountTotal),
      tax_total: numOrNull(candidate.supplied?.taxTotal),
      shipping_total: numOrNull(candidate.supplied?.shippingTotal),
      total: numOrNull(candidate.supplied?.total),
    },
  };
}

/** The context a source implies when the candidate does not state one. */
export function defaultContextFor(source: OrderCandidate["source"]): OrderContext {
  if (source === "woocommerce" || source === "shopify") return "B2C";
  if (source === "api") return "UNSPECIFIED";
  return "B2B";
}

function lineRowsFor(companyId: string, intakeId: string, lines: OrderCandidateLine[], actor: OrderEngineActor) {
  const now = new Date().toISOString();
  return lines.map((line, index) => ({
    id: randomUUID(),
    company_id: companyId,
    intake_id: intakeId,
    line_no: index + 1,
    source_line_reference: cleanText(line.sourceLineReference, 200),
    raw_sku: cleanText(line.sku, 200),
    raw_description: cleanText(line.description, 500),
    raw_unit: cleanText(line.unit, 40),
    quantity: round4(Number(line.quantity)),
    unit_price: numOrNull(line.unitPrice),
    discount_amount: numOrNull(line.discountAmount),
    tax_amount: numOrNull(line.taxAmount),
    line_total: numOrNull(line.lineTotal),
    product_id: line.productId || null,
    match_status: "PENDING",
    // A product a person explicitly chose is a manual match; validation re-verifies it.
    match_rule: line.productId ? "manual" : null,
    match_candidates: [],
    matched_by: line.productId ? actor.userId : null,
    matched_at: line.productId ? now : null,
    validation_status: "PENDING",
    extraction: line.extraction && typeof line.extraction === "object" ? line.extraction : {},
    source_snapshot: lineSourceSnapshot(line),
    created_at: now,
    updated_at: now,
  }));
}

function notify(intake: IntakeRow, event: OrderIntakeEvent, extra: { salesOrderNumber?: string | null } = {}) {
  return emitOrderIntakeNotification({
    event,
    companyId: intake.company_id,
    intakeId: intake.id,
    intakeNumber: intake.intake_number,
    source: intake.source,
    status: intake.status,
    blockingIssues: intake.blocking_issue_count,
    warnings: intake.warning_issue_count,
    salesOrderNumber: extra.salesOrderNumber ?? null,
  });
}

function newIntakeNumber(): string {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return `ORD-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function loadIntake(supabase: SupabaseClient, companyId: string, id: string): Promise<IntakeRow> {
  const { data, error } = await supabase.from(T_INTAKES).select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) raiseDbError(error, "Load order failed");
  if (!data) throw new OrderEngineError("NOT_FOUND", "Order not found.");
  return data as IntakeRow;
}

async function loadLines(supabase: SupabaseClient, companyId: string, intakeId: string): Promise<IntakeLineRow[]> {
  const { data, error } = await supabase
    .from(T_LINES)
    .select("*")
    .eq("company_id", companyId)
    .eq("intake_id", intakeId)
    .order("line_no", { ascending: true });
  if (error) raiseDbError(error, "Load order lines failed");
  return ((data || []) as IntakeLineRow[]).sort((a, b) => a.line_no - b.line_no);
}

async function loadEvents(supabase: SupabaseClient, companyId: string, intakeId: string): Promise<IntakeEventRow[]> {
  const { data, error } = await supabase
    .from(T_EVENTS)
    .select("*")
    .eq("company_id", companyId)
    .eq("intake_id", intakeId)
    .order("created_at", { ascending: true });
  if (error) raiseDbError(error, "Load order history failed");
  return ((data || []) as IntakeEventRow[]).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

async function writeEvent(
  supabase: SupabaseClient,
  intake: Pick<IntakeRow, "id" | "company_id">,
  actor: OrderEngineActor,
  event: { type: string; from?: IntakeStatus | null; to?: IntakeStatus | null; detail?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  const { error } = await supabase.from(T_EVENTS).insert({
    id: randomUUID(),
    company_id: intake.company_id,
    intake_id: intake.id,
    event_type: event.type,
    actor: actor.userId,
    actor_name: actor.name,
    from_status: event.from ?? null,
    to_status: event.to ?? null,
    detail: event.detail ?? null,
    metadata: event.metadata ?? {},
    created_at: new Date().toISOString(),
  });
  if (error) raiseDbError(error, "Audit write failed");
}

/**
 * Compare-and-set: move the intake only if it is still in the status and
 * version this request read. A concurrent change makes this a CONFLICT, so two
 * approvers can never both succeed.
 */
async function casUpdate(
  supabase: SupabaseClient,
  intake: IntakeRow,
  patch: Record<string, unknown>
): Promise<IntakeRow> {
  const { data, error } = await supabase
    .from(T_INTAKES)
    .update({ ...patch, version: intake.version + 1, updated_at: new Date().toISOString() })
    .eq("company_id", intake.company_id)
    .eq("id", intake.id)
    .eq("status", intake.status)
    .eq("version", intake.version)
    .select("*");
  if (error) raiseDbError(error, "Update order failed");
  const rows = (data || []) as IntakeRow[];
  if (rows.length !== 1) {
    throw new OrderEngineError("CONFLICT", "The order was changed by someone else. Reload and try again.");
  }
  return rows[0];
}

export type IntakeListView = "inbox" | "approvals" | "exceptions" | "approved" | "confirmed" | "closed" | "done" | "all";

const VIEW_STATUSES: Record<IntakeListView, IntakeStatus[] | null> = {
  inbox: ["RECEIVED", "EXCEPTION", "AWAITING_APPROVAL", "ON_HOLD", "APPROVED"],
  approvals: ["AWAITING_APPROVAL", "ON_HOLD"],
  exceptions: ["EXCEPTION"],
  approved: ["APPROVED"],
  confirmed: ["CONFIRMED"],
  closed: ["REJECTED", "CANCELLED"],
  done: ["CONFIRMED", "REJECTED", "CANCELLED"],
  all: null,
};

export type IntakeListRow = Pick<
  IntakeRow,
  | "id"
  | "intake_number"
  | "source"
  | "source_reference"
  | "external_order_number"
  | "customer_po_number"
  | "customer_id"
  | "customer_name"
  | "requested_delivery_date"
  | "status"
  | "blocking_issue_count"
  | "warning_issue_count"
  | "sales_order_id"
  | "decision_by"
  | "created_at"
  | "updated_at"
> & { line_count: number };

export type IntakeListFilters = {
  view?: IntakeListView;
  limit?: number;
  offset?: number;
  /** Order number, customer PO, external order number or customer name. */
  search?: string | null;
  source?: string | null;
  customerId?: string | null;
  /** Received on or after / on or before (YYYY-MM-DD). */
  from?: string | null;
  to?: string | null;
  withIssues?: "blocking" | "warnings" | null;
  decidedBy?: string | null;
};

/**
 * A search term safe to embed in a PostgREST `or` filter: letters, digits and
 * a few order-number punctuation marks only — commas, parentheses and quotes
 * (the filter grammar) and LIKE wildcards are removed.
 */
export function safeSearchTerm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._/#-]/gu, "")
    .trim()
    .slice(0, 60);
}

const LIST_COLUMNS =
  "id, intake_number, source, source_reference, external_order_number, customer_po_number, customer_id, customer_name, requested_delivery_date, status, blocking_issue_count, warning_issue_count, sales_order_id, decision_by, created_at, updated_at";

export async function listIntakes(
  supabase: SupabaseClient,
  companyId: string,
  options: IntakeListFilters = {}
): Promise<{ rows: IntakeListRow[]; counts: Record<IntakeStatus, number>; hasMore: boolean; offset: number; limit: number }> {
  const view = options.view && options.view in VIEW_STATUSES ? options.view : "inbox";
  const limit = Math.min(Math.max(Math.floor(Number(options.limit)) || 50, 1), 200);
  const offset = Math.max(Math.floor(Number(options.offset)) || 0, 0);
  let query = supabase.from(T_INTAKES).select(LIST_COLUMNS).eq("company_id", companyId);
  const statuses = VIEW_STATUSES[view];
  if (statuses) query = query.in("status", statuses);
  if (options.source && (ORDER_SOURCES as readonly string[]).includes(options.source)) query = query.eq("source", options.source);
  if (options.customerId) query = query.eq("customer_id", options.customerId);
  const from = toIsoDateOrNull(options.from);
  const to = toIsoDateOrNull(options.to);
  if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);
  if (options.withIssues === "blocking") query = query.gt("blocking_issue_count", 0);
  if (options.withIssues === "warnings") query = query.gt("warning_issue_count", 0);
  if (options.decidedBy) query = query.eq("decision_by", options.decidedBy);
  const term = safeSearchTerm(options.search);
  if (term) {
    const like = `%${term.replace(/_/g, "\\_")}%`;
    query = query.or(
      ["intake_number", "customer_po_number", "external_order_number", "customer_name"].map((column) => `${column}.ilike.${like}`).join(",")
    );
  }
  // One extra row tells us whether there is a next page.
  const { data, error } = await query.order("created_at", { ascending: false }).range(offset, offset + limit);
  if (error) raiseDbError(error, "List orders failed");
  const all = ((data || []) as IntakeListRow[]).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const hasMore = all.length > limit;
  const rows = all.slice(0, limit);

  const lineCounts = new Map<string, number>();
  if (rows.length) {
    const { data: lines, error: lineError } = await supabase
      .from(T_LINES)
      .select("intake_id")
      .eq("company_id", companyId)
      .in(
        "intake_id",
        rows.map((row) => row.id)
      );
    if (lineError) raiseDbError(lineError, "List order lines failed");
    for (const line of (lines || []) as Array<{ intake_id: string }>) {
      lineCounts.set(line.intake_id, (lineCounts.get(line.intake_id) || 0) + 1);
    }
  }

  const counts = Object.fromEntries(
    (["RECEIVED", "EXCEPTION", "AWAITING_APPROVAL", "ON_HOLD", "APPROVED", "CONFIRMED", "REJECTED", "CANCELLED"] as IntakeStatus[]).map((st) => [st, 0])
  ) as Record<IntakeStatus, number>;
  await Promise.all(
    (Object.keys(counts) as IntakeStatus[]).map(async (status) => {
      const { data: countRows, count, error: countError } = await supabase
        .from(T_INTAKES)
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", status);
      if (countError) raiseDbError(countError, "Count orders failed");
      counts[status] = typeof count === "number" ? count : Array.isArray(countRows) ? countRows.length : 0;
    })
  );

  return { rows: rows.map((row) => ({ ...row, line_count: lineCounts.get(row.id) || 0 })), counts, hasMore, offset, limit };
}

export type IntakeDetail = {
  intake: IntakeRow;
  lines: IntakeLineRow[];
  events: IntakeEventRow[];
  salesOrder: { id: string; order_number: string; status: string; total: number | null } | null;
  derived: {
    approvalStatus: ReturnType<typeof deriveApprovalStatus>;
    fulfilmentStatus: ReturnType<typeof deriveFulfilmentStatus>;
    invoiceStatus: ReturnType<typeof deriveInvoiceStatus>;
  };
};

export async function getIntakeDetail(supabase: SupabaseClient, companyId: string, id: string): Promise<IntakeDetail> {
  const intake = await loadIntake(supabase, companyId, id);
  const [lines, events] = await Promise.all([loadLines(supabase, companyId, id), loadEvents(supabase, companyId, id)]);
  let salesOrder: IntakeDetail["salesOrder"] = null;
  if (intake.sales_order_id) {
    const { data, error } = await supabase
      .from("vyron_customer_sales_orders")
      .select("id, order_number, status, total")
      .eq("company_id", companyId)
      .eq("id", intake.sales_order_id)
      .maybeSingle();
    if (error) raiseDbError(error, "Load sales order failed");
    salesOrder = data ? (data as NonNullable<IntakeDetail["salesOrder"]>) : null;
  }
  return {
    intake,
    lines,
    events,
    salesOrder,
    derived: {
      approvalStatus: deriveApprovalStatus(intake.status),
      fulfilmentStatus: deriveFulfilmentStatus(salesOrder?.status),
      invoiceStatus: deriveInvoiceStatus(salesOrder?.status),
    },
  };
}

// ---------------------------------------------------------------------------
// Receive (idempotent)
// ---------------------------------------------------------------------------

export type ReceiveResult = { intake: IntakeRow; lines: IntakeLineRow[]; duplicate: boolean };

async function findBySourceKey(supabase: SupabaseClient, companyId: string, source: string, sourceKey: string): Promise<IntakeRow | null> {
  const { data, error } = await supabase
    .from(T_INTAKES)
    .select("*")
    .eq("company_id", companyId)
    .eq("source", source)
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (error) raiseDbError(error, "Source lookup failed");
  return (data as IntakeRow) || null;
}

async function resolveDuplicate(
  supabase: SupabaseClient,
  existing: IntakeRow,
  contentHash: string,
  actor: OrderEngineActor
): Promise<ReceiveResult> {
  if (existing.content_hash !== contentHash) {
    throw new OrderEngineError(
      "DUPLICATE_SOURCE_CONFLICT",
      `This source order was already received as ${existing.intake_number} with different content. It is not overwritten; review the existing order.`,
      { intakeId: existing.id, intakeNumber: existing.intake_number }
    );
  }
  await writeEvent(supabase, existing, actor, {
    type: "RECEIVE_DUPLICATE",
    detail: "The same source order was received again; no new order was created.",
  });
  recordOrderEngineEvent("order.duplicate", { companyId: existing.company_id, intakeId: existing.id, intakeNumber: existing.intake_number, source: existing.source });
  return { intake: existing, lines: await loadLines(supabase, existing.company_id, existing.id), duplicate: true };
}

/**
 * Receive an order candidate from any source adapter. The same (source,
 * source key) with the same content returns the existing intake; with
 * different content it is refused — a changed external order is never
 * silently overwritten.
 */
export async function receiveOrderCandidate(
  supabase: SupabaseClient,
  companyId: string,
  candidate: OrderCandidate,
  actor: OrderEngineActor,
  options: { sourceMessageId?: string | null } = {}
): Promise<ReceiveResult> {
  assertCandidate(candidate);
  const contentHash = candidateContentHash(candidate);
  const sourceKey = cleanText(candidate.sourceKey, 300);

  if (sourceKey) {
    const existing = await findBySourceKey(supabase, companyId, candidate.source, sourceKey);
    if (existing) return resolveDuplicate(supabase, existing, contentHash, actor);
  }

  // A person's explicit customer choice must belong to this company.
  if (candidate.customerId) {
    const { data, error } = await supabase
      .from("vyron_customers")
      .select("id, customer_name")
      .eq("company_id", companyId)
      .eq("id", candidate.customerId)
      .maybeSingle();
    if (error) raiseDbError(error, "Customer lookup failed");
    if (!data) throw new OrderEngineError("INVALID_INPUT", "The chosen customer does not exist in this company.");
  }

  const now = new Date().toISOString();
  let intake: IntakeRow | null = null;
  for (let attempt = 0; attempt < 3 && !intake; attempt++) {
    const row = {
      id: randomUUID(),
      company_id: companyId,
      intake_number: newIntakeNumber(),
      source: candidate.source,
      source_key: sourceKey,
      source_reference: cleanText(candidate.sourceReference, 300),
      source_message_id: options.sourceMessageId ?? null,
      source_status: cleanText(candidate.sourceStatus, 60),
      content_hash: contentHash,
      external_order_number: cleanText(candidate.externalOrderNumber, 120),
      customer_po_number: cleanText(candidate.customerPoNumber, 120),
      customer_id: candidate.customerId || null,
      customer_name: cleanText(candidate.customerName, 300),
      customer_reference: cleanText(candidate.customerReference ?? candidate.senderEmail, 300),
      customer_match_rule: candidate.customerId ? "customer_id" : null,
      order_date: toIsoDateOrNull(candidate.orderDate),
      requested_delivery_date: toIsoDateOrNull(candidate.requestedDeliveryDate),
      currency: cleanText(candidate.currency, 10)?.toUpperCase() ?? null,
      delivery_address: cleanText(candidate.deliveryAddress, 1000),
      contact_name: cleanText(candidate.contactName, 200),
      notes: cleanText(candidate.notes, 4000),
      supplied_subtotal: numOrNull(candidate.supplied?.subtotal),
      supplied_discount_total: numOrNull(candidate.supplied?.discountTotal),
      supplied_tax_total: numOrNull(candidate.supplied?.taxTotal),
      supplied_total: numOrNull(candidate.supplied?.total),
      supplied_shipping_total: numOrNull(candidate.supplied?.shippingTotal),
      prices_include_tax: typeof candidate.pricesIncludeTax === "boolean" ? candidate.pricesIncludeTax : null,
      extraction: candidate.extraction && typeof candidate.extraction === "object" ? candidate.extraction : {},
      order_context: candidate.context || defaultContextFor(candidate.source),
      source_channel: cleanText(candidate.sourceChannel, 120) || candidate.source,
      extraction_confidence: ["HIGH", "MEDIUM", "LOW"].includes(String(candidate.extraction?.confidence)) ? candidate.extraction!.confidence! : null,
      source_snapshot: intakeSourceSnapshot(candidate),
      status: "RECEIVED",
      validation: {},
      blocking_issue_count: 0,
      warning_issue_count: 0,
      created_by: actor.userId,
      version: 1,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await supabase.from(T_INTAKES).insert(row).select("*").single();
    if (!error) {
      intake = data as IntakeRow;
      break;
    }
    if (!isUniqueViolation(error)) raiseDbError(error, "Create order failed");
    // Lost a race on the source identity: the winner is the answer.
    if (sourceKey) {
      const winner = await findBySourceKey(supabase, companyId, candidate.source, sourceKey);
      if (winner) return resolveDuplicate(supabase, winner, contentHash, actor);
    }
    // Otherwise an intake-number collision: try another number.
  }
  if (!intake) throw new Error("Create order failed: could not allocate an order number.");

  const lineRows = lineRowsFor(companyId, intake.id, candidate.lines, actor);
  const { error: lineError } = await supabase.from(T_LINES).insert(lineRows);
  if (lineError) {
    // Never leave a header without its lines.
    await supabase.from(T_INTAKES).delete().eq("company_id", companyId).eq("id", intake.id);
    raiseDbError(lineError, "Create order lines failed");
  }

  await writeEvent(supabase, intake, actor, {
    type: "RECEIVED",
    to: "RECEIVED",
    detail: `Order received from ${candidate.source}${intake.source_reference ? ` (${intake.source_reference})` : ""} with ${lineRows.length} line(s).`,
    metadata: { source: candidate.source, sourceKey, contentHash, lineCount: lineRows.length },
  });
  recordOrderEngineEvent("order.received", { companyId, intakeId: intake.id, intakeNumber: intake.intake_number, source: candidate.source, lines: lineRows.length });
  await notify(intake, "ORDER_RECEIVED");

  return { intake, lines: await loadLines(supabase, companyId, intake.id), duplicate: false };
}

// ---------------------------------------------------------------------------
// Edit (only while RECEIVED or EXCEPTION)
// ---------------------------------------------------------------------------

export type IntakeEdit = {
  customerId?: string | null;
  customerName?: string | null;
  customerPoNumber?: string | null;
  requestedDeliveryDate?: string | null;
  deliveryAddress?: string | null;
  contactName?: string | null;
  notes?: string | null;
  /**
   * Resolve a line to a product a person chose. `remember` also records an
   * approved alias: this customer's item code (or description) → that product,
   * used by future orders. Needs the caller's `canRemember`.
   */
  resolveLines?: Array<{ lineId: string; productId: string; remember?: boolean }>;
  /** Remember the order's customer reference (e.g. a web-store customer id) → the chosen customer. */
  rememberCustomerReference?: boolean;
  /**
   * A person confirms the line prices are now ex-tax (the source stated tax-
   * inclusive prices and they have been converted). Clears PRICES_INCLUDE_TAX.
   */
  confirmPricesExTax?: boolean;
  /** Replace a line's quantity or price (as corrected with the customer). */
  updateLines?: Array<{ lineId: string; quantity?: number; unitPrice?: number | null }>;
  expectedVersion?: number;
};

export type EditOptions = {
  /** The caller may record standing mappings (aliases, customer identities). */
  canRemember?: boolean;
};

export async function editIntake(
  supabase: SupabaseClient,
  companyId: string,
  id: string,
  edit: IntakeEdit,
  actor: OrderEngineActor,
  options: EditOptions = {}
): Promise<IntakeDetail> {
  const intake = await loadIntake(supabase, companyId, id);
  const wantsMapping = Boolean(edit.rememberCustomerReference || edit.resolveLines?.some((r) => r.remember));
  if (wantsMapping && !options.canRemember) {
    throw new OrderEngineError("INVALID_INPUT", "Only a member who can approve orders may record a standing mapping.");
  }
  if (!isEditable(intake.status)) {
    throw new OrderEngineError("INVALID_TRANSITION", `An order that is ${intake.status} cannot be edited.`);
  }
  if (edit.expectedVersion !== undefined && edit.expectedVersion !== intake.version) {
    throw new OrderEngineError("CONFLICT", "The order was changed by someone else. Reload and try again.");
  }
  const lines = await loadLines(supabase, companyId, id);
  const byId = new Map(lines.map((line) => [line.id, line]));
  const changes: string[] = [];
  const header: Record<string, unknown> = {};
  const resolutions: Array<
    | { kind: "customer"; customerId: string; customerName: string }
    | { kind: "line"; lineId: string; lineNo: number; productId: string; productName: string; remember: boolean; aliasKey: string | null }
  > = [];

  if (edit.customerId !== undefined) {
    if (edit.customerId) {
      const { data, error } = await supabase
        .from("vyron_customers")
        .select("id, customer_name")
        .eq("company_id", companyId)
        .eq("id", edit.customerId)
        .maybeSingle();
      if (error) raiseDbError(error, "Customer lookup failed");
      if (!data) throw new OrderEngineError("INVALID_INPUT", "The chosen customer does not exist in this company.");
      header.customer_id = edit.customerId;
      header.customer_match_rule = "customer_id";
      changes.push(`customer set to ${String((data as { customer_name?: string }).customer_name || edit.customerId)}`);
      resolutions.push({ kind: "customer", customerId: edit.customerId, customerName: String((data as { customer_name?: string }).customer_name || "") });
    } else {
      header.customer_id = null;
      header.customer_match_rule = null;
      changes.push("customer choice cleared");
    }
  }
  const textFields: Array<[keyof IntakeEdit, string, number]> = [
    ["customerName", "customer_name", 300],
    ["customerPoNumber", "customer_po_number", 120],
    ["deliveryAddress", "delivery_address", 1000],
    ["contactName", "contact_name", 200],
    ["notes", "notes", 4000],
  ];
  for (const [key, column, max] of textFields) {
    if (edit[key] !== undefined) {
      header[column] = cleanText(edit[key], max);
      changes.push(`${column.replace(/_/g, " ")} updated`);
    }
  }
  if (edit.confirmPricesExTax) {
    if (intake.prices_include_tax !== true) throw new OrderEngineError("INVALID_INPUT", "This order's prices were not stated as tax-inclusive.");
    header.prices_include_tax = false;
    changes.push("line prices confirmed as ex-tax");
  }
  if (edit.requestedDeliveryDate !== undefined) {
    if (edit.requestedDeliveryDate && !toIsoDateOrNull(edit.requestedDeliveryDate)) {
      throw new OrderEngineError("INVALID_INPUT", "The requested delivery date must be a YYYY-MM-DD date.");
    }
    header.requested_delivery_date = toIsoDateOrNull(edit.requestedDeliveryDate);
    changes.push("requested delivery date updated");
  }

  const lineUpdates: Array<{ line: IntakeLineRow; patch: Record<string, unknown>; note: string }> = [];
  if (edit.resolveLines?.length) {
    const products = await loadProductsById(
      supabase,
      companyId,
      edit.resolveLines.map((r) => r.productId)
    );
    for (const resolution of edit.resolveLines) {
      const line = byId.get(resolution.lineId);
      if (!line) throw new OrderEngineError("INVALID_INPUT", "A line to resolve is not part of this order.");
      const product = products.get(resolution.productId);
      if (!product) throw new OrderEngineError("INVALID_INPUT", `Line ${line.line_no}: the chosen product does not exist in this company.`);
      lineUpdates.push({
        line,
        patch: {
          product_id: product.id,
          match_status: "MATCHED",
          match_rule: "manual",
          matched_by: actor.userId,
          matched_at: new Date().toISOString(),
        },
        note: `line ${line.line_no} matched to ${product.product_name || product.id} by a person`,
      });
      resolutions.push({
        kind: "line",
        lineId: line.id,
        lineNo: line.line_no,
        productId: product.id,
        productName: String(product.product_name || ""),
        remember: resolution.remember === true,
        aliasKey: aliasKeyFor({ rawSku: line.raw_sku, rawDescription: line.raw_description }),
      });
    }
  }
  for (const update of edit.updateLines || []) {
    const line = byId.get(update.lineId);
    if (!line) throw new OrderEngineError("INVALID_INPUT", "A line to update is not part of this order.");
    const patch: Record<string, unknown> = {};
    if (update.quantity !== undefined) {
      const quantity = Number(update.quantity);
      if (!Number.isFinite(quantity)) throw new OrderEngineError("INVALID_INPUT", `Line ${line.line_no}: quantity is not a number.`);
      patch.quantity = round4(quantity);
    }
    if (update.unitPrice !== undefined) {
      const price = update.unitPrice === null ? null : Number(update.unitPrice);
      if (price !== null && !Number.isFinite(price)) throw new OrderEngineError("INVALID_INPUT", `Line ${line.line_no}: price is not a number.`);
      patch.unit_price = price;
    }
    if (Object.keys(patch).length) {
      lineUpdates.push({
        line,
        patch,
        note: `line ${line.line_no} ${Object.keys(patch)
          .map((k) => `${k.replace(/_/g, " ")} ${String(line[k as keyof IntakeLineRow])} → ${String(patch[k])}`)
          .join(", ")}`,
      });
    }
  }

  if (!changes.length && !lineUpdates.length && !edit.rememberCustomerReference) throw new OrderEngineError("INVALID_INPUT", "Nothing to change.");

  // Standing mappings are checked before anything is written.
  const mappingCustomerId = (header.customer_id as string | null | undefined) ?? intake.customer_id ?? null;
  if (resolutions.some((r) => r.kind === "line" && r.remember)) {
    if (!mappingCustomerId) throw new OrderEngineError("INVALID_INPUT", "Identify the customer before remembering their item codes.");
    for (const r of resolutions) {
      if (r.kind === "line" && r.remember && !r.aliasKey) throw new OrderEngineError("INVALID_INPUT", `Line ${r.lineNo} has no SKU or description to remember.`);
    }
  }
  const identityKey = identityKeyFor(intake.customer_reference);
  if (edit.rememberCustomerReference) {
    if (!identityKey) throw new OrderEngineError("INVALID_INPUT", "This order carries no customer reference to remember.");
    if (!mappingCustomerId) throw new OrderEngineError("INVALID_INPUT", "Choose the customer before remembering the reference.");
  }

  // Header first, as the compare-and-set: a concurrent edit loses here, before any line changes.
  const updated = await casUpdate(supabase, intake, {
    ...header,
    status: "RECEIVED",
    validation: {},
    validation_hash: null,
    validated_at: null,
    blocking_issue_count: 0,
    warning_issue_count: 0,
  });
  for (const { line, patch } of lineUpdates) {
    const { error } = await supabase
      .from(T_LINES)
      .update({ ...patch, validation_status: "PENDING", updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("intake_id", id)
      .eq("id", line.id);
    if (error) raiseDbError(error, "Update order line failed");
  }

  const remembered: string[] = [];
  for (const r of resolutions) {
    if (r.kind !== "line" || !r.remember) continue;
    await recordProductAlias(supabase, companyId, { customerId: mappingCustomerId!, aliasKey: r.aliasKey!, productId: r.productId, intakeId: id, actor });
    remembered.push(`remembered ${r.aliasKey} → ${r.productName}`);
  }
  if (edit.rememberCustomerReference) {
    await recordCustomerIdentity(supabase, companyId, { source: intake.source, reference: intake.customer_reference!, customerId: mappingCustomerId!, intakeId: id, actor });
    remembered.push(`remembered customer reference for ${intake.source}`);
  }

  await writeEvent(supabase, updated, actor, {
    type: "EDITED",
    from: intake.status,
    to: "RECEIVED",
    detail: [...changes, ...lineUpdates.map((u) => u.note), ...remembered].join("; "),
    metadata: { header: Object.keys(header), lines: lineUpdates.map((u) => ({ lineId: u.line.id, patch: u.patch })) },
  });
  // One event per resolved exception, so "who resolved it, when" is answerable per line.
  for (const r of resolutions) {
    await writeEvent(supabase, updated, actor, {
      type: r.kind === "customer" ? "CUSTOMER_RESOLVED" : "LINE_RESOLVED",
      detail: r.kind === "customer" ? `Customer set to ${r.customerName || r.customerId}.` : `Line ${r.lineNo} matched to ${r.productName}${r.remember ? " (remembered for this customer)" : ""}.`,
      metadata: r.kind === "customer" ? { customerId: r.customerId, remembered: Boolean(edit.rememberCustomerReference) } : { lineId: r.lineId, lineNo: r.lineNo, productId: r.productId, remembered: r.remember },
    });
  }
  return getIntakeDetail(supabase, companyId, id);
}

// ---------------------------------------------------------------------------
// Standing mappings (recorded human decisions; revoke-only)
// ---------------------------------------------------------------------------

async function recordProductAlias(
  supabase: SupabaseClient,
  companyId: string,
  input: { customerId: string; aliasKey: string; productId: string; intakeId: string; actor: OrderEngineActor }
) {
  const { data: existing, error } = await supabase
    .from("vyron_order_product_aliases")
    .select("id, product_id")
    .eq("company_id", companyId)
    .eq("customer_id", input.customerId)
    .eq("source_code_normalized", input.aliasKey)
    .is("revoked_at", null);
  if (error) raiseDbError(error, "Alias lookup failed");
  const live = (existing || []) as Array<{ id: string; product_id: string }>;
  if (live.some((row) => row.product_id === input.productId)) return;
  if (live.length) {
    throw new OrderEngineError("CONFLICT", "This customer's code is already mapped to another product. Revoke that mapping first.");
  }
  const { error: insertError } = await supabase.from("vyron_order_product_aliases").insert({
    id: randomUUID(),
    company_id: companyId,
    customer_id: input.customerId,
    source_code: input.aliasKey.replace(/^(sku|desc):/, ""),
    source_code_normalized: input.aliasKey,
    product_id: input.productId,
    created_by: input.actor.userId,
    created_by_name: input.actor.name,
    source_intake_id: input.intakeId,
    created_at: new Date().toISOString(),
  });
  if (insertError) {
    if (isUniqueViolation(insertError)) throw new OrderEngineError("CONFLICT", "Someone else just mapped this code. Reload and check.");
    raiseDbError(insertError, "Record alias failed");
  }
}

async function recordCustomerIdentity(
  supabase: SupabaseClient,
  companyId: string,
  input: { source: string; reference: string; customerId: string; intakeId: string; actor: OrderEngineActor }
) {
  const key = identityKeyFor(input.reference);
  const { data: existing, error } = await supabase
    .from("vyron_order_customer_identities")
    .select("id, customer_id")
    .eq("company_id", companyId)
    .eq("source", input.source)
    .eq("external_reference_normalized", key)
    .is("revoked_at", null);
  if (error) raiseDbError(error, "Customer identity lookup failed");
  const live = (existing || []) as Array<{ id: string; customer_id: string }>;
  if (live.some((row) => row.customer_id === input.customerId)) return;
  if (live.length) {
    // Never silently re-point a reference: that would merge two customers' order histories.
    throw new OrderEngineError("CONFLICT", "This customer reference is already mapped to another customer. Revoke that mapping first.");
  }
  const { error: insertError } = await supabase.from("vyron_order_customer_identities").insert({
    id: randomUUID(),
    company_id: companyId,
    source: input.source,
    external_reference: input.reference,
    external_reference_normalized: key,
    customer_id: input.customerId,
    created_by: input.actor.userId,
    created_by_name: input.actor.name,
    source_intake_id: input.intakeId,
    created_at: new Date().toISOString(),
  });
  if (insertError) {
    if (isUniqueViolation(insertError)) throw new OrderEngineError("CONFLICT", "Someone else just mapped this reference. Reload and check.");
    raiseDbError(insertError, "Record customer identity failed");
  }
}

export type StandingMapping = {
  kind: "product_alias" | "customer_identity";
  id: string;
  key: string;
  customerId: string | null;
  productId: string | null;
  source: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  sourceIntakeId: string | null;
};

export async function listStandingMappings(supabase: SupabaseClient, companyId: string, options: { includeRevoked?: boolean } = {}): Promise<StandingMapping[]> {
  let aliases = supabase.from("vyron_order_product_aliases").select("*").eq("company_id", companyId);
  let identities = supabase.from("vyron_order_customer_identities").select("*").eq("company_id", companyId);
  if (!options.includeRevoked) {
    aliases = aliases.is("revoked_at", null);
    identities = identities.is("revoked_at", null);
  }
  const [a, i] = await Promise.all([aliases.limit(500), identities.limit(500)]);
  if (a.error) raiseDbError(a.error, "List aliases failed");
  if (i.error) raiseDbError(i.error, "List customer identities failed");
  type Row = Record<string, string | null>;
  return [
    ...((a.data || []) as Row[]).map((row) => ({
      kind: "product_alias" as const,
      id: String(row.id),
      key: String(row.source_code_normalized),
      customerId: row.customer_id,
      productId: row.product_id,
      source: null,
      createdBy: String(row.created_by),
      createdByName: row.created_by_name ?? null,
      createdAt: String(row.created_at),
      revokedAt: row.revoked_at,
      revokedBy: row.revoked_by,
      sourceIntakeId: row.source_intake_id,
    })),
    ...((i.data || []) as Row[]).map((row) => ({
      kind: "customer_identity" as const,
      id: String(row.id),
      key: String(row.external_reference_normalized),
      customerId: row.customer_id,
      productId: null,
      source: row.source,
      createdBy: String(row.created_by),
      createdByName: row.created_by_name ?? null,
      createdAt: String(row.created_at),
      revokedAt: row.revoked_at,
      revokedBy: row.revoked_by,
      sourceIntakeId: row.source_intake_id,
    })),
  ].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

/** Revoke (never delete) a standing mapping. Future validations stop using it; past orders keep their audit. */
export async function revokeStandingMapping(
  supabase: SupabaseClient,
  companyId: string,
  kind: StandingMapping["kind"],
  id: string,
  actor: OrderEngineActor
): Promise<void> {
  const table = kind === "product_alias" ? "vyron_order_product_aliases" : kind === "customer_identity" ? "vyron_order_customer_identities" : null;
  if (!table) throw new OrderEngineError("INVALID_INPUT", "Unknown mapping type.");
  const { data, error } = await supabase
    .from(table)
    .update({ revoked_at: new Date().toISOString(), revoked_by: actor.userId })
    .eq("company_id", companyId)
    .eq("id", id)
    .is("revoked_at", null)
    .select("id");
  if (error) raiseDbError(error, "Revoke mapping failed");
  if (!data || data.length !== 1) throw new OrderEngineError("NOT_FOUND", "Mapping not found, or already revoked.");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** What the approver must have seen: everything except the timestamp. */
function snapshotHash(snapshot: ValidationSnapshot): string {
  return stableHash({ customer: snapshot.customer, issues: snapshot.issues, lines: snapshot.lines, totals: snapshot.totals });
}

async function computeValidation(supabase: SupabaseClient, intake: IntakeRow, lines: IntakeLineRow[], today?: string) {
  const ctx = await loadValidationContext(supabase, intake, lines, { today });
  const snapshot = runValidators(ctx);
  return { ctx, snapshot, hash: snapshotHash(snapshot) };
}

/** Persist a validation run: line match results, customer resolution, snapshot and status. */
async function persistValidation(
  supabase: SupabaseClient,
  intake: IntakeRow,
  lines: IntakeLineRow[],
  result: Awaited<ReturnType<typeof computeValidation>>,
  toStatus: IntakeStatus
): Promise<IntakeRow> {
  const { ctx, snapshot, hash } = result;
  const customerPatch: Record<string, unknown> = {};
  if (intake.customer_match_rule !== "customer_id") {
    customerPatch.customer_id = ctx.customer.status === "MATCHED" ? ctx.customer.customer!.id : null;
    customerPatch.customer_match_rule = ctx.customer.status === "MATCHED" ? ctx.customer.rule : null;
  }
  const updated = await casUpdate(supabase, intake, {
    ...customerPatch,
    status: toStatus,
    validation: snapshot,
    validation_hash: hash,
    validated_at: snapshot.validatedAt,
    blocking_issue_count: snapshot.counts.errors,
    warning_issue_count: snapshot.counts.warnings,
  });
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = ctx.lines[index].match;
    const evaluation = snapshot.lines[index];
    const { error } = await supabase
      .from(T_LINES)
      .update({
        product_id: match.product?.id ?? null,
        match_status: match.status,
        match_rule: match.rule,
        match_candidates: match.candidates,
        validation_status: evaluation.status,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", intake.company_id)
      .eq("intake_id", intake.id)
      .eq("id", line.id);
    if (error) raiseDbError(error, "Save line validation failed");
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type ActionOptions = {
  reason?: string | null;
  acknowledgeWarnings?: boolean;
  /** The validation hash the approver was shown. Required to approve. */
  validationHash?: string | null;
  /** For tests: the date validators treat as today. */
  today?: string;
};

function requireReason(action: IntakeAction, reason: string | null | undefined): string | null {
  const text = cleanText(reason, 2000);
  if (ACTION_REQUIRES_REASON.has(action) && !text) {
    throw new OrderEngineError("INVALID_INPUT", `A reason is required to ${action.replace("_", " ")} an order.`);
  }
  return text;
}

export async function performIntakeAction(
  supabase: SupabaseClient,
  companyId: string,
  id: string,
  action: IntakeAction,
  actor: OrderEngineActor,
  options: ActionOptions = {}
): Promise<IntakeDetail> {
  if (!(action in ACTION_FROM)) throw new OrderEngineError("INVALID_INPUT", `Unknown action "${String(action)}".`);
  const intake = await loadIntake(supabase, companyId, id);
  if (!ACTION_FROM[action].includes(intake.status)) {
    throw new OrderEngineError("INVALID_TRANSITION", `Cannot ${action.replace("_", " ")} an order that is ${intake.status}.`);
  }
  const reason = requireReason(action, options.reason);
  const now = new Date().toISOString();

  switch (action) {
    case "validate":
    case "release": {
      const lines = await loadLines(supabase, companyId, id);
      const result = await computeValidation(supabase, intake, lines, options.today);
      const to: IntakeStatus = result.snapshot.counts.errors > 0 ? "EXCEPTION" : "AWAITING_APPROVAL";
      const updated = await persistValidation(supabase, intake, lines, result, to);
      await writeEvent(supabase, updated, actor, {
        type: action === "release" ? "RELEASED" : "VALIDATED",
        from: intake.status,
        to,
        detail:
          to === "EXCEPTION"
            ? `Validation found ${result.snapshot.counts.errors} blocking issue(s).`
            : `Validation passed with ${result.snapshot.counts.warnings} warning(s); awaiting approval.`,
        metadata: {
          counts: result.snapshot.counts,
          codes: result.snapshot.issues.map((i) => i.code),
          validationHash: result.hash,
          customer: { matched: Boolean(result.snapshot.customer.id), rule: result.snapshot.customer.matchRule },
          matching: result.snapshot.matching,
          policy: result.snapshot.policy,
        },
      });
      recordOrderEngineEvent(to === "EXCEPTION" ? "order.exception" : "order.awaiting_approval", {
        companyId,
        intakeId: id,
        intakeNumber: intake.intake_number,
        source: intake.source,
        fromStatus: intake.status,
        toStatus: to,
        lines: lines.length,
        errors: result.snapshot.counts.errors,
        warnings: result.snapshot.counts.warnings,
        codes: result.snapshot.issues.map((i) => i.code),
      });
      await notify(updated, to === "EXCEPTION" ? "ORDER_EXCEPTION" : "APPROVAL_REQUIRED");
      if (to === "EXCEPTION") {
        await writeEvent(supabase, updated, actor, {
          type: "EXCEPTION_RAISED",
          to,
          detail: result.snapshot.issues
            .filter((i) => i.severity === "error")
            .map((i) => (i.lineNo ? `line ${i.lineNo}: ${i.message}` : i.message))
            .join(" · "),
          metadata: { codes: result.snapshot.issues.filter((i) => i.severity === "error").map((i) => i.code) },
        });
      } else if (action === "validate") {
        await writeEvent(supabase, updated, actor, { type: "APPROVAL_REQUESTED", to });
      }
      break;
    }

    case "approve": {
      if (!options.validationHash) {
        throw new OrderEngineError("VALIDATION_REQUIRED", "Approval must state the validation it is based on. Reload the order.");
      }
      if (options.validationHash !== intake.validation_hash) {
        throw new OrderEngineError("CONFLICT", "The validation you reviewed is no longer current. Reload the order.");
      }
      // Re-validate against live data: stock, prices and customer status may have moved.
      const lines = await loadLines(supabase, companyId, id);
      const result = await computeValidation(supabase, intake, lines, options.today);
      if (result.hash !== intake.validation_hash) {
        const to: IntakeStatus = result.snapshot.counts.errors > 0 ? "EXCEPTION" : "AWAITING_APPROVAL";
        const updated = await persistValidation(supabase, intake, lines, result, to);
        await writeEvent(supabase, updated, actor, {
          type: "APPROVAL_REVALIDATION_CHANGED",
          from: intake.status,
          to,
          detail: "Live data changed since the order was validated; approval was not given. Review the updated validation.",
          metadata: { codes: result.snapshot.issues.map((i) => i.code), validationHash: result.hash },
        });
        recordOrderEngineEvent("order.approval_refused", { companyId, intakeId: id, intakeNumber: intake.intake_number, reason: "LIVE_DATA_CHANGED", toStatus: to });
        throw new OrderEngineError(
          to === "EXCEPTION" ? "VALIDATION_FAILED" : "CONFLICT",
          to === "EXCEPTION"
            ? "Re-validation found blocking issues; the order has moved to Exceptions."
            : "Live data changed since you reviewed this order. Review the updated validation and approve again."
        );
      }
      const warnings = result.snapshot.issues.filter((i) => i.severity === "warning");
      if (warnings.length && options.acknowledgeWarnings !== true) {
        throw new OrderEngineError("WARNINGS_NOT_ACKNOWLEDGED", `Acknowledge the ${warnings.length} warning(s) to approve.`, {
          codes: warnings.map((w) => w.code),
        });
      }
      const pendingSalesOrderId = intake.pending_sales_order_id || randomUUID();
      const approved = await casUpdate(supabase, intake, {
        status: "APPROVED",
        decision_by: actor.userId,
        decision_at: now,
        decision_note: reason,
        pending_sales_order_id: pendingSalesOrderId,
      });
      await writeEvent(supabase, approved, actor, {
        type: "APPROVED",
        from: intake.status,
        to: "APPROVED",
        detail: reason || "Approved.",
        metadata: {
          validationHash: intake.validation_hash,
          acknowledgedWarnings: warnings.map((w) => ({ code: w.code, lineNo: w.lineNo ?? null, message: w.message })),
        },
      });
      recordOrderEngineEvent("order.approved", { companyId, intakeId: id, intakeNumber: intake.intake_number, source: intake.source, warnings: warnings.length });
      await notify(approved, "ORDER_APPROVED");
      await handOff(supabase, approved, actor);
      break;
    }

    case "confirm": {
      await handOff(supabase, intake, actor);
      break;
    }

    case "hold": {
      const updated = await casUpdate(supabase, intake, { status: "ON_HOLD", decision_by: actor.userId, decision_at: now, decision_note: reason });
      await writeEvent(supabase, updated, actor, { type: "HELD", from: intake.status, to: "ON_HOLD", detail: reason! });
      recordOrderEngineEvent("order.held", { companyId, intakeId: id, intakeNumber: intake.intake_number });
      await notify(updated, "ORDER_ON_HOLD");
      break;
    }

    case "request_changes": {
      const updated = await casUpdate(supabase, intake, {
        status: "RECEIVED",
        decision_by: actor.userId,
        decision_at: now,
        decision_note: reason,
        validation: {},
        validation_hash: null,
        validated_at: null,
        blocking_issue_count: 0,
        warning_issue_count: 0,
      });
      await writeEvent(supabase, updated, actor, { type: "CHANGES_REQUESTED", from: intake.status, to: "RECEIVED", detail: reason! });
      break;
    }

    case "reject": {
      const updated = await casUpdate(supabase, intake, { status: "REJECTED", decision_by: actor.userId, decision_at: now, decision_note: reason });
      await writeEvent(supabase, updated, actor, { type: "REJECTED", from: intake.status, to: "REJECTED", detail: reason! });
      recordOrderEngineEvent("order.rejected", { companyId, intakeId: id, intakeNumber: intake.intake_number, fromStatus: intake.status });
      await notify(updated, "ORDER_REJECTED");
      break;
    }

    case "cancel": {
      const updated = await casUpdate(supabase, intake, { status: "CANCELLED", decision_note: reason });
      await writeEvent(supabase, updated, actor, { type: "CANCELLED", from: intake.status, to: "CANCELLED", detail: reason! });
      recordOrderEngineEvent("order.cancelled", { companyId, intakeId: id, intakeNumber: intake.intake_number, fromStatus: intake.status });
      break;
    }
  }

  return getIntakeDetail(supabase, companyId, id);
}

// ---------------------------------------------------------------------------
// Handoff to the existing sales-order engine (idempotent)
// ---------------------------------------------------------------------------

/**
 * Create the Draft sales order for an APPROVED intake, then mark it CONFIRMED.
 *
 * The sales-order id was claimed on the intake before this runs. If a previous
 * attempt already wrote that sales order (a crash between the write and the
 * link), this finds and links it instead of creating a second one.
 *
 * Nothing is reserved, posted, invoiced, e-mailed or sent to Xero: the order is
 * a Draft, and the sales-order engine's own submit/approve rules still apply.
 */
async function handOff(supabase: SupabaseClient, intake: IntakeRow, actor: OrderEngineActor): Promise<void> {
  const salesOrderId = intake.pending_sales_order_id;
  if (intake.status !== "APPROVED" || !salesOrderId) {
    throw new OrderEngineError("INVALID_TRANSITION", "Only an approved order can be handed to Sales Orders.");
  }
  const snapshot = intake.validation as ValidationSnapshot;
  try {
    const { data: existing, error: existingError } = await supabase
      .from("vyron_customer_sales_orders")
      .select("id, order_number, status")
      .eq("company_id", intake.company_id)
      .eq("id", salesOrderId)
      .maybeSingle();
    if (existingError) raiseDbError(existingError, "Sales order lookup failed");

    let order = existing as { id: string; order_number: string; status: string } | null;
    if (order) {
      // A previous attempt wrote this order. Link it only if it is complete.
      const { data: soLines, error: soLinesError } = await supabase
        .from("vyron_customer_sales_order_lines")
        .select("id")
        .eq("company_id", intake.company_id)
        .eq("sales_order_id", order.id);
      if (soLinesError) raiseDbError(soLinesError, "Sales order line lookup failed");
      if (!soLines || soLines.length === 0) {
        throw new Error(`Sales order ${order.order_number} exists without lines from an earlier failed attempt; it needs manual review before this order can be confirmed.`);
      }
    } else {
      if (!snapshot?.lines?.length || !snapshot.customer?.id) {
        throw new Error("The approved validation is incomplete; re-validate the order.");
      }
      const lines = await loadLines(supabase, intake.company_id, intake.id);
      const byNo = new Map(lines.map((line) => [line.line_no, line]));
      const taxRate = await resolveDefaultVatRate(supabase, intake.company_id);
      const salesLines = snapshot.lines.map((evaluation) => {
        const line = byNo.get(evaluation.lineNo);
        if (!evaluation.productId || evaluation.effectiveUnitPrice === null || !line) {
          throw new Error(`Line ${evaluation.lineNo} is not fully resolved; re-validate the order.`);
        }
        if (!(evaluation.effectiveUnitPrice > 0)) {
          // The sales-order engine substitutes the master price for a zero price.
          throw new Error(`Line ${evaluation.lineNo} has a zero price, which Sales Orders cannot carry without substituting a price.`);
        }
        const gross = evaluation.quantity * evaluation.effectiveUnitPrice;
        const discount = Number(line.discount_amount || 0);
        return {
          productId: evaluation.productId,
          description: String(evaluation.productName || line.raw_description || ""),
          quantity: evaluation.quantity,
          unit: line.raw_unit || "each",
          sellingPrice: evaluation.effectiveUnitPrice,
          discountPct: gross > 0 && discount > 0 ? round4((discount / gross) * 100) : 0,
          taxRate,
        };
      });
      const reference = [
        `From order ${intake.intake_number}`,
        `source ${intake.source}`,
        intake.customer_po_number ? `PO ${intake.customer_po_number}` : null,
        intake.external_order_number ? `ext ${intake.external_order_number}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const created = await saveCustomerSalesOrder(supabase, intake.company_id, {
        newOrderId: salesOrderId,
        auditActor: actor.userId,
        customerId: snapshot.customer.id,
        customerName: snapshot.customer.name || intake.customer_name || "Customer",
        deliveryAddress: intake.delivery_address || undefined,
        contactName: intake.contact_name || undefined,
        requestedDeliveryDate: intake.requested_delivery_date,
        notes: [reference, intake.notes].filter(Boolean).join("\n"),
        lines: salesLines,
      });
      order = { id: created.id, order_number: created.order_number, status: created.status };
      await writeSalesOrderAudit(supabase, {
        companyId: intake.company_id,
        salesOrderId: created.id,
        eventType: "CREATED_FROM_ORDER_INTAKE",
        actor: actor.userId,
        toStatus: created.status,
        detail: `Created from approved order ${intake.intake_number}.`,
        metadata: { intakeId: intake.id, intakeNumber: intake.intake_number, source: intake.source },
      });
    }

    const confirmed = await casUpdate(supabase, intake, { status: "CONFIRMED", sales_order_id: order.id });
    await writeEvent(supabase, confirmed, actor, {
      type: "CONFIRMED",
      from: "APPROVED",
      to: "CONFIRMED",
      detail: `Handed to Sales Orders as ${order.order_number} (${order.status}). Nothing was reserved, invoiced or posted.`,
      metadata: { salesOrderId: order.id, salesOrderNumber: order.order_number, salesOrderStatus: order.status },
    });
    recordOrderEngineEvent("order.handoff_succeeded", { companyId: intake.company_id, intakeId: intake.id, intakeNumber: intake.intake_number, salesOrderId: order.id });
    await notify(confirmed, "ORDER_CONFIRMED", { salesOrderNumber: order.order_number });
  } catch (error) {
    if (error instanceof OrderEngineError && error.code !== "HANDOFF_FAILED") throw error;
    const message = error instanceof Error ? error.message : String(error);
    // Two requests completing the same handoff: the pre-claimed id makes the
    // second insert collide. That is a concurrency outcome, not a failure — the
    // other request creates (or has created) the one sales order.
    if (/duplicate key|already exists|23505/i.test(message)) {
      throw new OrderEngineError("CONFLICT", "Another request is completing this order's handoff. Reload the order.");
    }
    recordOrderEngineEvent("order.handoff_failed", { companyId: intake.company_id, intakeId: intake.id, intakeNumber: intake.intake_number, reason: "HANDOFF_FAILED" });
    await writeEvent(supabase, intake, actor, {
      type: "HANDOFF_FAILED",
      from: "APPROVED",
      to: "APPROVED",
      detail: message,
      metadata: { pendingSalesOrderId: salesOrderId },
    }).catch(() => undefined);
    throw new OrderEngineError("HANDOFF_FAILED", `Approved, but the sales order could not be created: ${message} Fix the cause and choose Confirm to retry.`);
  }
}

// ---------------------------------------------------------------------------
// Exception Centre
// ---------------------------------------------------------------------------

export type ExceptionRow = {
  intakeId: string;
  intakeNumber: string;
  intakeStatus: IntakeStatus;
  customerName: string | null;
  source: string;
  receivedAt: string;
  lineNo: number | null;
  code: string;
  severity: "error" | "warning";
  blocking: boolean;
  category: string;
  title: string;
  message: string;
  action: string;
  /** What the order said, where the issue has one value to show. */
  originalValue: string | null;
  /** What VOLORA expected or requires. */
  expectedValue: string | null;
  /** When the issue was raised (the validation run) and by whom. */
  raisedAt: string | null;
  raisedBy: string | null;
};

/** An inbound document that did not become an order. */
export type DocumentExceptionRow = {
  messageId: string;
  channel: string;
  receivedAt: string;
  from: string | null;
  subject: string | null;
  code: "DOCUMENT_NEEDS_EXTRACTION" | "NO_ORDER_FOUND" | "DOCUMENT_FAILED";
  severity: "error" | "warning";
  documents: string[];
  reason: string | null;
  action: string;
};

function display(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return String(Math.round(value * 10000) / 10000);
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k} ${display(v)}`)
      .join(", ") || null;
  }
  return String(value);
}

/** The original and expected values an issue carries, in words. */
export function issueValues(issue: { code: string; data?: Record<string, unknown> }): { originalValue: string | null; expectedValue: string | null } {
  const d = issue.data || {};
  switch (issue.code) {
    case "PRICE_MISMATCH":
      return { originalValue: display(d.supplied), expectedValue: display(d.expected) };
    case "INSUFFICIENT_STOCK":
      return { originalValue: `ordered ${display(d.ordered)}`, expectedValue: `available ${display(d.available)}` };
    case "PRODUCTION_REQUIRED":
      return { originalValue: `ordered ${display(d.ordered)}`, expectedValue: `produce ${display(d.quantity)}` };
    case "LOW_MARGIN":
      return { originalValue: null, expectedValue: `at least ${display(d.minimumPct)}% GP` };
    case "EXTRACTION_LOW_CONFIDENCE":
      return { originalValue: display(d.field), expectedValue: "confirmed value" };
    default:
      return { originalValue: display(d.original), expectedValue: display(d.expected) };
  }
}

export type ResolutionRow = {
  intakeId: string;
  intakeNumber: string | null;
  type: "LINE_RESOLVED" | "CUSTOMER_RESOLVED";
  detail: string | null;
  resolvedBy: string;
  resolvedByName: string | null;
  resolvedAt: string;
  remembered: boolean;
};

/**
 * Every open blocking issue and warning across orders still in play, with
 * what it means and what to do (issue-catalog.ts), plus the most recent
 * resolutions — who resolved what, when.
 */
export async function listExceptionCentre(
  supabase: SupabaseClient,
  companyId: string,
  options: { includeWarnings?: boolean } = {}
): Promise<{ open: ExceptionRow[]; resolved: ResolutionRow[]; documents: DocumentExceptionRow[] }> {
  const { issueDefinition } = await import("@/lib/order-engine/issue-catalog");
  const { data, error } = await supabase
    .from(T_INTAKES)
    .select("id, intake_number, status, customer_name, source, created_at, validation, validated_at")
    .eq("company_id", companyId)
    .in("status", ["EXCEPTION", "AWAITING_APPROVAL", "ON_HOLD"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) raiseDbError(error, "List exceptions failed");
  const open: ExceptionRow[] = [];
  const openRows = (data || []) as Array<Pick<IntakeRow, "id" | "intake_number" | "status" | "customer_name" | "source" | "created_at" | "validation" | "validated_at">>;
  // Who ran the validation that raised each order's issues.
  const raisers = new Map<string, string>();
  if (openRows.length) {
    const { data: runs, error: runError } = await supabase
      .from(T_EVENTS)
      .select("intake_id, event_type, actor, actor_name, created_at")
      .eq("company_id", companyId)
      .in("intake_id", openRows.map((r) => r.id))
      .in("event_type", ["VALIDATED", "RELEASED", "APPROVAL_REVALIDATION_CHANGED"]);
    if (runError) raiseDbError(runError, "List exceptions failed");
    for (const e of ((runs || []) as IntakeEventRow[]).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
      raisers.set(e.intake_id, e.actor_name || e.actor);
    }
  }
  for (const row of openRows) {
    const snapshot = row.validation as ValidationSnapshot;
    for (const issue of snapshot?.issues || []) {
      if (issue.severity === "info") continue;
      if (issue.severity === "warning" && options.includeWarnings === false) continue;
      const def = issueDefinition(issue.code);
      open.push({
        intakeId: row.id,
        intakeNumber: row.intake_number,
        intakeStatus: row.status,
        customerName: row.customer_name,
        source: row.source,
        receivedAt: row.created_at,
        lineNo: issue.lineNo ?? null,
        code: issue.code,
        severity: issue.severity,
        blocking: issue.severity === "error",
        category: issue.category,
        title: def?.title || issue.code,
        message: issue.message,
        action: def?.action || "Review the order.",
        ...issueValues(issue),
        raisedAt: row.validated_at ?? snapshot?.validatedAt ?? null,
        raisedBy: raisers.get(row.id) ?? null,
      });
    }
  }
  open.sort((a, b) => Number(b.blocking) - Number(a.blocking) || b.receivedAt.localeCompare(a.receivedAt));

  const { data: events, error: eventError } = await supabase
    .from(T_EVENTS)
    .select("intake_id, event_type, detail, actor, actor_name, created_at, metadata")
    .eq("company_id", companyId)
    .in("event_type", ["LINE_RESOLVED", "CUSTOMER_RESOLVED"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (eventError) raiseDbError(eventError, "List resolutions failed");
  const eventRows = ((events || []) as Array<IntakeEventRow>).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const ids = [...new Set(eventRows.map((e) => e.intake_id))];
  const numbers = new Map<string, string>();
  if (ids.length) {
    const { data: intakes, error: intakeError } = await supabase.from(T_INTAKES).select("id, intake_number").eq("company_id", companyId).in("id", ids);
    if (intakeError) raiseDbError(intakeError, "List resolutions failed");
    for (const row of (intakes || []) as Array<{ id: string; intake_number: string }>) numbers.set(row.id, row.intake_number);
  }
  const resolved: ResolutionRow[] = eventRows.map((e) => ({
    intakeId: e.intake_id,
    intakeNumber: numbers.get(e.intake_id) || null,
    type: e.event_type as ResolutionRow["type"],
    detail: e.detail,
    resolvedBy: e.actor,
    resolvedByName: e.actor_name,
    resolvedAt: e.created_at,
    remembered: Boolean((e.metadata as { remembered?: boolean })?.remembered),
  }));

  // Inbound documents that did not become orders.
  const documents: DocumentExceptionRow[] = [];
  const { data: messages, error: messageError } = await supabase
    .from("vyron_order_source_messages")
    .select("id, channel, received_at, from_address, subject, attachments, processing_status, processing_error")
    .eq("company_id", companyId)
    .in("processing_status", ["NEEDS_EXTRACTION", "NO_ORDER_FOUND", "FAILED"])
    .order("received_at", { ascending: false })
    .limit(100);
  if (messageError && !isMissingRelation(messageError)) raiseDbError(messageError, "List documents failed");
  for (const m of (messages || []) as Array<{
    id: string;
    channel: string;
    received_at: string;
    from_address: string | null;
    subject: string | null;
    attachments: Array<{ fileName?: string }> | null;
    processing_status: string;
    processing_error: string | null;
  }>) {
    const code = m.processing_status === "NEEDS_EXTRACTION" ? "DOCUMENT_NEEDS_EXTRACTION" : m.processing_status === "FAILED" ? "DOCUMENT_FAILED" : "NO_ORDER_FOUND";
    documents.push({
      messageId: m.id,
      channel: m.channel,
      receivedAt: m.received_at,
      from: m.from_address,
      subject: m.subject,
      code,
      severity: code === "NO_ORDER_FOUND" ? "warning" : "error",
      documents: (m.attachments || []).map((a) => String(a.fileName || "attachment")),
      reason: m.processing_error,
      action:
        code === "DOCUMENT_NEEDS_EXTRACTION"
          ? "Enter the order manually from the document (New order), or process it through a document extractor."
          : code === "DOCUMENT_FAILED"
            ? "Open the message, correct the file with the customer if needed, and enter the order manually."
            : "Check the message; if it is an order, enter it manually.",
    });
  }
  return { open, resolved, documents };
}
