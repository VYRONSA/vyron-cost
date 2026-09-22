/**
 * VYRON Order Engine — shared types.
 *
 * The Order Engine is the intake layer in front of the existing sales-order
 * engine (src/lib/vyron-customer-sales-orders.ts). An intake is an order as it
 * was received from a source; once approved it is handed to that engine as a
 * Draft sales order. Design record: docs/order-engine/ORDER_ENGINE_ARCHITECTURE.md
 */

export const ORDER_SOURCES = ["manual", "csv", "xlsx", "email", "pdf", "woocommerce", "shopify", "api", "edi"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const INTAKE_STATUSES = [
  "RECEIVED",
  "EXCEPTION",
  "AWAITING_APPROVAL",
  "ON_HOLD",
  "APPROVED",
  "CONFIRMED",
  "REJECTED",
  "CANCELLED",
] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export type MatchStatus = "PENDING" | "MATCHED" | "UNMATCHED" | "AMBIGUOUS";
export type MatchRule = "manual" | "sku_exact" | "sku_normalized" | "alias" | "name_exact";
export type CustomerMatchRule = "customer_id" | "name_exact" | "sender_email";

export type IssueSeverity = "error" | "warning" | "info";
export type IssueCategory =
  | "customer"
  | "product"
  | "quantity"
  | "price"
  | "stock"
  | "production"
  | "margin"
  | "commercial"
  | "arithmetic";

export type ValidationIssue = {
  code: string;
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  lineNo?: number;
  data?: Record<string, unknown>;
};

/** One line exactly as a source adapter produced it. Nothing here is matched or priced. */
export type OrderCandidateLine = {
  sourceLineReference?: string | null;
  sku?: string | null;
  description?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice?: number | null;
  discountAmount?: number | null;
  taxAmount?: number | null;
  lineTotal?: number | null;
  /** Only the manual adapter may carry a product the user explicitly chose. */
  productId?: string | null;
};

/** The one shape every order source produces. */
export type OrderCandidate = {
  source: OrderSource;
  /** Idempotency key within (company, source). Required for every non-manual source. */
  sourceKey?: string | null;
  sourceReference?: string | null;
  sourceStatus?: string | null;
  externalOrderNumber?: string | null;
  customerPoNumber?: string | null;
  /** Only the manual adapter may carry a customer the user explicitly chose. */
  customerId?: string | null;
  customerName?: string | null;
  /** A raw customer identifier from the source (account code, e-mail, external id). */
  customerReference?: string | null;
  /** Sender address, for the e-mail source's customer rung. */
  senderEmail?: string | null;
  orderDate?: string | null;
  requestedDeliveryDate?: string | null;
  currency?: string | null;
  deliveryAddress?: string | null;
  contactName?: string | null;
  notes?: string | null;
  supplied?: {
    subtotal?: number | null;
    discountTotal?: number | null;
    taxTotal?: number | null;
    total?: number | null;
  };
  lines: OrderCandidateLine[];
};

export type IntakeRow = {
  id: string;
  company_id: string;
  intake_number: string;
  source: OrderSource;
  source_key: string | null;
  source_reference: string | null;
  source_message_id: string | null;
  source_status: string | null;
  content_hash: string;
  external_order_number: string | null;
  customer_po_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_reference: string | null;
  customer_match_rule: string | null;
  order_date: string | null;
  requested_delivery_date: string | null;
  currency: string | null;
  delivery_address: string | null;
  contact_name: string | null;
  notes: string | null;
  supplied_subtotal: number | null;
  supplied_discount_total: number | null;
  supplied_tax_total: number | null;
  supplied_total: number | null;
  status: IntakeStatus;
  validation: ValidationSnapshot | Record<string, never>;
  validation_hash: string | null;
  validated_at: string | null;
  blocking_issue_count: number;
  warning_issue_count: number;
  decision_by: string | null;
  decision_at: string | null;
  decision_note: string | null;
  pending_sales_order_id: string | null;
  sales_order_id: string | null;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type IntakeLineRow = {
  id: string;
  company_id: string;
  intake_id: string;
  line_no: number;
  source_line_reference: string | null;
  raw_sku: string | null;
  raw_description: string | null;
  raw_unit: string | null;
  quantity: number;
  unit_price: number | null;
  discount_amount: number | null;
  tax_amount: number | null;
  line_total: number | null;
  product_id: string | null;
  match_status: MatchStatus;
  match_rule: MatchRule | null;
  match_candidates: MatchCandidate[];
  matched_by: string | null;
  matched_at: string | null;
  validation_status: "PENDING" | "OK" | "WARNING" | "ERROR";
  created_at: string;
  updated_at: string;
};

export type IntakeEventRow = {
  id: string;
  company_id: string;
  intake_id: string;
  event_type: string;
  actor: string;
  actor_name: string | null;
  from_status: string | null;
  to_status: string | null;
  detail: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type MatchCandidate = { productId: string; productName: string; sku: string | null };

export type LineEvaluation = {
  lineNo: number;
  productId: string | null;
  productName: string | null;
  sku: string | null;
  matchStatus: MatchStatus;
  matchRule: MatchRule | null;
  quantity: number;
  suppliedUnitPrice: number | null;
  expectedUnitPrice: number | null;
  priceSource: string | null;
  effectiveUnitPrice: number | null;
  netAmount: number | null;
  unitCost: number | null;
  lineCost: number | null;
  lineGp: number | null;
  onHand: number | null;
  reservedElsewhere: number | null;
  available: number | null;
  shortfall: number | null;
  hasBom: boolean | null;
  status: "OK" | "WARNING" | "ERROR";
};

/** What a validation run stores on the intake — the approver sees exactly this. */
export type ValidationSnapshot = {
  version: 1;
  validatedAt: string;
  customer: { id: string | null; name: string | null; matchRule: CustomerMatchRule | null };
  issues: ValidationIssue[];
  lines: LineEvaluation[];
  totals: {
    expectedSubtotal: number | null;
    expectedCost: number | null;
    expectedGp: number | null;
    expectedGpPct: number | null;
    /** Lines whose cost could not be measured; margin covers the rest only. */
    marginNotMeasuredLines: number;
  };
  counts: { errors: number; warnings: number; info: number };
};

export type ApprovalStatus = "PENDING" | "ON_HOLD" | "APPROVED" | "REJECTED" | "NOT_APPLICABLE";
export type FulfilmentStatus = "NOT_STARTED" | "IN_PROGRESS" | "DISPATCHED" | "CANCELLED" | "NOT_APPLICABLE";
export type InvoiceStatus = "NOT_INVOICED" | "PARTIALLY_INVOICED" | "INVOICED" | "NOT_APPLICABLE";

/** The verified actor behind a request — always from the server session. */
export type OrderEngineActor = { userId: string; name: string | null };
