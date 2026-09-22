import { randomBytes, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDefaultVatRate } from "@/lib/vyron-customer-invoices";
import { saveCustomerSalesOrder, writeSalesOrderAudit } from "@/lib/vyron-customer-sales-orders";
import { OrderEngineError, isUniqueViolation, raiseDbError } from "@/lib/order-engine/errors";
import {
  ACTION_FROM,
  ACTION_REQUIRES_REASON,
  deriveApprovalStatus,
  deriveFulfilmentStatus,
  deriveInvoiceStatus,
  isEditable,
  type IntakeAction,
} from "@/lib/order-engine/lifecycle";
import { loadProductsById } from "@/lib/order-engine/matching";
import { candidateContentHash, cleanText, round4, stableHash, toIsoDateOrNull } from "@/lib/order-engine/normalize";
import type {
  IntakeEventRow,
  IntakeLineRow,
  IntakeRow,
  IntakeStatus,
  OrderCandidate,
  OrderCandidateLine,
  OrderEngineActor,
  ValidationSnapshot,
} from "@/lib/order-engine/types";
import { ORDER_SOURCES } from "@/lib/order-engine/types";
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
    created_at: now,
    updated_at: now,
  }));
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

export type IntakeListView = "inbox" | "approvals" | "exceptions" | "done" | "all";

const VIEW_STATUSES: Record<IntakeListView, IntakeStatus[] | null> = {
  inbox: ["RECEIVED", "EXCEPTION", "AWAITING_APPROVAL", "ON_HOLD", "APPROVED"],
  approvals: ["AWAITING_APPROVAL", "ON_HOLD"],
  exceptions: ["EXCEPTION"],
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
  | "created_at"
  | "updated_at"
> & { line_count: number };

export async function listIntakes(
  supabase: SupabaseClient,
  companyId: string,
  options: { view?: IntakeListView; limit?: number } = {}
): Promise<{ rows: IntakeListRow[]; counts: Record<IntakeStatus, number> }> {
  const view = options.view && options.view in VIEW_STATUSES ? options.view : "inbox";
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 200);
  let query = supabase
    .from(T_INTAKES)
    .select(
      "id, intake_number, source, source_reference, external_order_number, customer_po_number, customer_id, customer_name, requested_delivery_date, status, blocking_issue_count, warning_issue_count, sales_order_id, created_at, updated_at"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const statuses = VIEW_STATUSES[view];
  if (statuses) query = query.in("status", statuses);
  const { data, error } = await query;
  if (error) raiseDbError(error, "List orders failed");
  const rows = ((data || []) as IntakeListRow[]).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

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
    (["RECEIVED", "EXCEPTION", "AWAITING_APPROVAL", "ON_HOLD", "APPROVED", "CONFIRMED", "REJECTED", "CANCELLED"] as IntakeStatus[]).map((s) => [s, 0])
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

  return { rows: rows.map((row) => ({ ...row, line_count: lineCounts.get(row.id) || 0 })), counts };
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
  /** Resolve a line to a product a person chose. */
  resolveLines?: Array<{ lineId: string; productId: string }>;
  /** Replace a line's quantity or price (as corrected with the customer). */
  updateLines?: Array<{ lineId: string; quantity?: number; unitPrice?: number | null }>;
  expectedVersion?: number;
};

export async function editIntake(
  supabase: SupabaseClient,
  companyId: string,
  id: string,
  edit: IntakeEdit,
  actor: OrderEngineActor
): Promise<IntakeDetail> {
  const intake = await loadIntake(supabase, companyId, id);
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

  if (!changes.length && !lineUpdates.length) throw new OrderEngineError("INVALID_INPUT", "Nothing to change.");

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

  await writeEvent(supabase, updated, actor, {
    type: "EDITED",
    from: intake.status,
    to: "RECEIVED",
    detail: [...changes, ...lineUpdates.map((u) => u.note)].join("; "),
    metadata: { header: Object.keys(header), lines: lineUpdates.map((u) => ({ lineId: u.line.id, patch: u.patch })) },
  });
  return getIntakeDetail(supabase, companyId, id);
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
        metadata: { counts: result.snapshot.counts, codes: result.snapshot.issues.map((i) => i.code), validationHash: result.hash },
      });
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
      break;
    }

    case "cancel": {
      const updated = await casUpdate(supabase, intake, { status: "CANCELLED", decision_note: reason });
      await writeEvent(supabase, updated, actor, { type: "CANCELLED", from: intake.status, to: "CANCELLED", detail: reason! });
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
  } catch (error) {
    if (error instanceof OrderEngineError && error.code !== "HANDOFF_FAILED") throw error;
    const message = error instanceof Error ? error.message : String(error);
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
