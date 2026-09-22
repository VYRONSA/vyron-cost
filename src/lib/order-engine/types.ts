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
export type MatchRule = "manual" | "external_id" | "sku_exact" | "sku_normalized" | "customer_alias" | "alias" | "name_exact";
export type CustomerMatchRule = "customer_id" | "external_id" | "identity_map" | "name_exact" | "sender_email" | "b2c_account";

/**
 * The business context an order arrives in. B2B: a trading customer ordering
 * on account (PO, delivery rules, customer pricing). B2C: a web-store
 * consumer order. Both enter the same canonical intake.
 */
export const ORDER_CONTEXTS = ["B2B", "B2C", "UNSPECIFIED"] as const;
export type OrderContext = (typeof ORDER_CONTEXTS)[number];

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
  | "arithmetic"
  | "policy"
  | "tax"
  | "extraction";

export type ValidationIssue = {
  code: string;
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  lineNo?: number;
  data?: Record<string, unknown>;
};

/**
 * How a value was obtained. `ai` and `ocr` values are candidates only: they are
 * always reviewed by a person and never approve anything by themselves.
 */
export type ExtractionMethod = "structured" | "manual" | "rule" | "ai" | "ocr";
export type ExtractionConfidence = "HIGH" | "MEDIUM" | "LOW";

/** Provenance of one extracted field (AI extraction contract, docs/order-engine/ORDER_SOURCE_ADAPTERS.md). */
export type ExtractedFieldMeta = {
  confidence: ExtractionConfidence;
  method: ExtractionMethod;
  /** Where in the source the value was read, e.g. "email body line 4", "page 1, table row 3". */
  source?: string | null;
};

/** Extraction metadata carried by an order or a line: field name → provenance. */
export type ExtractionMeta = {
  method?: ExtractionMethod;
  /** Overall confidence the extractor states for the whole order (document extraction). */
  confidence?: ExtractionConfidence;
  /** Which extractor produced the order, e.g. { name: "vendor-x", version: "2" }. */
  extractor?: { name: string; version?: string | null } | null;
  fields?: Record<string, ExtractedFieldMeta>;
  /** Facts the source stated that have no column: shown to the approver, never acted on automatically. */
  sourceFacts?: { couponCodes?: string[]; refundedTotal?: number | null };
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
  /** The product's id in the source system (e.g. a web-store product id), matched via vyron_import_source_links. */
  externalProductId?: string | null;
  /**
   * Values exactly as written in the source, when an extractor normalised the
   * fields above. Kept in the frozen source snapshot; never used for matching.
   */
  sourceValues?: { sku?: string | null; productName?: string | null; quantity?: string; price?: string };
  extraction?: ExtractionMeta | null;
};

/** The one shape every order source produces. */
export type OrderCandidate = {
  source: OrderSource;
  /** B2B / B2C. Omitted: the source's default (web stores B2C, account channels B2B). */
  context?: OrderContext | null;
  /** The concrete channel, e.g. "email", "web_store:<store key>", "manual", "csv_upload". */
  sourceChannel?: string | null;
  /**
   * The system external ids belong to, as recorded in vyron_import_source_links
   * (source_system). Required for external-id matching; never guessed.
   */
  catalogSystem?: string | null;
  /** The customer's id in the source system, matched via vyron_import_source_links. */
  externalCustomerId?: string | null;
  /**
   * "historical" orders (e.g. Metorik / WooCommerce history) are external sales
   * intelligence, never intake: they are refused. Default "fulfilment".
   */
  purpose?: "fulfilment" | "historical";
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
    shippingTotal?: number | null;
    total?: number | null;
  };
  /** True when the source states its prices include tax. VYRON sales orders are priced ex-tax. */
  pricesIncludeTax?: boolean | null;
  extraction?: ExtractionMeta | null;
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
  supplied_shipping_total: number | null;
  prices_include_tax: boolean | null;
  extraction: ExtractionMeta | Record<string, never>;
  order_context?: OrderContext;
  source_channel?: string | null;
  extraction_confidence?: ExtractionConfidence | null;
  /** What the source said, frozen at receipt (never edited). */
  source_snapshot?: IntakeSourceSnapshot | Record<string, never>;
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
  extraction: ExtractionMeta | Record<string, never>;
  /** What the source said about this line, frozen at receipt (never edited). */
  source_snapshot?: LineSourceSnapshot | Record<string, never>;
  created_at: string;
  updated_at: string;
};

/** The order header exactly as the source stated it. */
export type IntakeSourceSnapshot = {
  customer_name: string | null;
  customer_reference: string | null;
  external_customer_id: string | null;
  catalog_system: string | null;
  po_number: string | null;
  external_order_number: string | null;
  source_order_reference: string | null;
  requested_delivery_date: string | null;
  delivery_address: string | null;
  currency: string | null;
  prices_include_tax: boolean | null;
  supplied: { subtotal: number | null; discount_total: number | null; tax_total: number | null; shipping_total: number | null; total: number | null };
};

/** One line exactly as the source stated it. */
export type LineSourceSnapshot = {
  source_sku: string | null;
  source_product_name: string | null;
  source_external_product_id: string | null;
  source_quantity: number;
  source_unit: string | null;
  source_price: number | null;
  source_discount: number | null;
  source_tax: number | null;
  source_line_total: number | null;
  /** Quantity and price exactly as written, when the source wrote them differently from the parsed numbers. */
  as_written?: { quantity?: string; price?: string };
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

/** One component of a product that must be produced (estimate from the product's BOM). */
export type ProductionComponent = {
  ingredientId: string | null;
  name: string;
  unit: string | null;
  /** Required = shortfall × BOM quantity × (1 + wastage) ÷ BOM yield. */
  required: number;
  /** On hand for the component's stock item; null when it has no stock record or units differ. */
  available: number | null;
  shortfall: number | null;
  note: string | null;
};

/** What producing a line's shortfall would take — shown, never acted on. */
export type ProductionRequirement = {
  lineNo: number;
  productId: string;
  productName: string | null;
  quantityRequired: number;
  availableFinished: number;
  shortfall: number;
  bomId: string | null;
  bomName: string | null;
  bomYield: number | null;
  components: ProductionComponent[];
  /** All stock-tracked components cover the requirement (null: not measurable). */
  componentsAvailable: boolean | null;
};

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
  /** The customer order policy applied, if any (null: no policy — no customer rules were checked). */
  policy: { id: string | null; scope: "customer" | "company" } | null;
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
  /** How many lines matched, and by which rule — shown on the order timeline. */
  matching: { matched: number; unmatched: number; ambiguous: number; byRule: Record<string, number> };
  /** Order context at validation (B2B / B2C / UNSPECIFIED). */
  context?: OrderContext;
  /** Production required for lines stock cannot cover (estimate; nothing is produced). */
  production?: ProductionRequirement[];
  /** The tenant ordering settings applied. */
  settings?: { b2cAccountConfigured: boolean; productNameMatching: "review" | "off"; duplicatePoAction: "warn" | "block"; minLeadTimeDays: number | null };
};

/** Tenant-scoped ordering settings (vyron_order_engine_settings). Every setting is conservative until set. */
export type OrderEngineSettings = {
  company_id: string;
  b2c_customer_id: string | null;
  product_name_matching: "review" | "off";
  duplicate_po_action: "warn" | "block";
  min_lead_time_days: number | null;
  updated_by: string;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
};

/** Optional customer (or company-default) ordering rules. Every rule is off unless set. */
export type CustomerOrderPolicy = {
  id: string;
  company_id: string;
  customer_id: string | null;
  require_po: boolean;
  require_delivery_date: boolean;
  min_order_value: number | null;
  min_gp_pct: number | null;
  enforce_case_quantity: boolean;
  delivery_weekdays: number[] | null;
  order_cutoff_time: string | null;
  special_instructions: string | null;
  updated_by: string;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
};

export type ApprovalStatus = "PENDING" | "ON_HOLD" | "APPROVED" | "REJECTED" | "NOT_APPLICABLE";
export type FulfilmentStatus = "NOT_STARTED" | "IN_PROGRESS" | "DISPATCHED" | "CANCELLED" | "NOT_APPLICABLE";
export type InvoiceStatus = "NOT_INVOICED" | "PARTIALLY_INVOICED" | "INVOICED" | "NOT_APPLICABLE";

/** The verified actor behind a request — always from the server session. */
export type OrderEngineActor = { userId: string; name: string | null };
