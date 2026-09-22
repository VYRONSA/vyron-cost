import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCustomerProductPrice } from "@/lib/vyron-customer-price-lists";
import { loadReservedQuantities } from "@/lib/vyron-sales-order-reservations";
import { isMissingRelation, raiseDbError } from "@/lib/order-engine/errors";
import { createProductMatcher, loadProductsById, matchCustomer, type CustomerMatch, type ProductMatch, type ProductRecord } from "@/lib/order-engine/matching";
import { normalizeName, round2, round4 } from "@/lib/order-engine/normalize";
import { DEFAULT_ORDER_SETTINGS, loadChannelSettings, loadOrderSettings, type ChannelSettings, type EffectiveOrderSettings } from "@/lib/order-engine/settings";
import type {
  CustomerOrderPolicy,
  ExtractionMeta,
  IntakeLineRow,
  IntakeRow,
  IntakeSourceSnapshot,
  IssueCategory,
  LineEvaluation,
  LineSourceSnapshot,
  OrderContext,
  ProductionComponent,
  ProductionRequirement,
  ValidationIssue,
  ValidationSnapshot,
} from "@/lib/order-engine/types";

/**
 * The validation framework.
 *
 * `loadValidationContext` does all reading (customer, product matches, prices,
 * stock and live reservations, BOM presence, pack sizes, the customer's order
 * policy, earlier intakes with the same PO) exactly once. Validators are pure
 * functions over that context: they never touch the database, so each is
 * testable on its own and adding a check is a new entry in VALIDATORS.
 * `error` blocks approval, `warning` must be acknowledged, `info` is shown.
 * The meaning and required action of every code: issue-catalog.ts.
 */

export type LineContext = {
  line: IntakeLineRow;
  match: ProductMatch;
  expectedPrice: { sellingPrice: number; source: string; priceListId: string | null } | null;
  priceError: string | null;
  stock: { onHand: number | null; reservedElsewhere: number; hasStockRecord: boolean } | null;
  hasBom: boolean | null;
  unitsPerCase: number | null;
};

export type ValidationContext = {
  intake: IntakeRow;
  customer: CustomerMatch;
  lines: LineContext[];
  /** Other live intakes for the same customer and PO number. */
  samePoIntakes: Array<{ id: string; intake_number: string; status: string }>;
  /** Other live intakes with the same external order number (any source). */
  sameReferenceIntakes?: Array<{ id: string; intake_number: string; status: string; source: string }>;
  policy: { policy: CustomerOrderPolicy; scope: "customer" | "company" } | null;
  /** Tenant ordering settings (defaults when absent). */
  settings?: EffectiveOrderSettings;
  /** The channel's own settings, for a web-store order. */
  channel?: ChannelSettings | null;
  context?: OrderContext;
  /** BOM detail for products whose demand stock cannot cover. */
  production?: Map<string, ProductionBom>;
  today: string;
};

/** A product's BOM, as needed to estimate a production requirement. */
export type ProductionBom = {
  bomId: string | null;
  bomName: string | null;
  yieldQty: number | null;
  /** Set when no single BOM can be used (more than one). */
  note: string | null;
  lines: Array<{ ingredientId: string | null; name: string; quantity: number; unit: string | null; wastagePct: number; stockQty: number | null; stockUnit: string | null; hasStock: boolean }>;
};

const DEFAULT_SETTINGS: EffectiveOrderSettings = DEFAULT_ORDER_SETTINGS;

export type OrderValidator = {
  id: string;
  category: IssueCategory;
  run(ctx: ValidationContext): ValidationIssue[];
};

const PRICE_TOLERANCE = 0.005;
const AMOUNT_TOLERANCE = 0.01;
const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function netAmount(line: IntakeLineRow, unitPrice: number | null): number | null {
  if (unitPrice === null) return null;
  return round2(Number(line.quantity) * unitPrice - Number(line.discount_amount || 0));
}

/** The price the order will carry: what the customer stated, else what VYRON expects. */
function effectivePrice(ctx: LineContext): number | null {
  if (ctx.line.unit_price !== null && ctx.line.unit_price !== undefined) return Number(ctx.line.unit_price);
  if (ctx.expectedPrice && ctx.expectedPrice.sellingPrice > 0) return ctx.expectedPrice.sellingPrice;
  return null;
}

/** Net value and current cost of the lines whose cost is known. */
function costedTotals(ctx: ValidationContext) {
  let net = 0;
  let cost = 0;
  let subtotal: number | null = 0;
  for (const lineCtx of ctx.lines) {
    const lineNet = netAmount(lineCtx.line, effectivePrice(lineCtx));
    if (lineNet === null) subtotal = null;
    else if (subtotal !== null) subtotal = round2(subtotal + lineNet);
    const unitCost = lineCtx.match.product?.total_cost;
    if (lineNet !== null && unitCost !== null && unitCost !== undefined && Number(unitCost) > 0) {
      net = round2(net + lineNet);
      cost = round2(cost + Number(unitCost) * Number(lineCtx.line.quantity));
    }
  }
  return { net, cost, subtotal };
}

function isoWeekday(date: string): number | null {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const customerValidator: OrderValidator = {
  id: "customer",
  category: "customer",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const match = ctx.customer;
    if (match.status === "UNMATCHED") {
      issues.push({ code: "CUSTOMER_NOT_FOUND", severity: "error", category: "customer", message: match.reason });
      return issues;
    }
    if (match.status === "AMBIGUOUS") {
      issues.push({ code: "CUSTOMER_AMBIGUOUS", severity: "error", category: "customer", message: `${match.reason} Choose the customer.`, data: { candidates: match.candidates } });
      return issues;
    }
    const customer = match.customer!;
    const status = String(customer.status || "").toLowerCase();
    if (customer.active === false || status === "inactive" || status === "archived") {
      issues.push({ code: "CUSTOMER_INACTIVE", severity: "error", category: "customer", message: `Customer ${customer.customer_name || customer.id} is not active.` });
    }
    if (customer.on_hold === true || status.includes("hold")) {
      issues.push({ code: "CUSTOMER_ON_HOLD", severity: "warning", category: "customer", message: `Customer ${customer.customer_name || customer.id} is on hold.` });
    }
    if (match.rule === "sender_email") {
      issues.push({
        code: "CUSTOMER_MATCHED_BY_EMAIL",
        severity: "warning",
        category: "customer",
        message: `Customer identified only by the sender's e-mail address — confirm it is ${customer.customer_name || customer.id}.`,
      });
    }
    return issues;
  },
};

const productValidator: OrderValidator = {
  id: "product",
  category: "product",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const seen = new Map<string, number>();
    for (const { line, match } of ctx.lines) {
      if (match.status === "UNMATCHED") {
        issues.push({ code: "PRODUCT_UNMATCHED", severity: "error", category: "product", lineNo: line.line_no, message: match.reason });
      } else if (match.status === "AMBIGUOUS") {
        issues.push({ code: "PRODUCT_AMBIGUOUS", severity: "error", category: "product", lineNo: line.line_no, message: `${match.reason} Choose the product.`, data: { candidates: match.candidates } });
      } else if (match.rule === "name_exact") {
        issues.push({
          code: "PRODUCT_MATCHED_BY_NAME",
          severity: "warning",
          category: "product",
          lineNo: line.line_no,
          message: `Matched by exact product name because the line has no SKU — confirm "${match.product?.product_name}".`,
        });
      }
      if (match.product) {
        const earlier = seen.get(match.product.id);
        if (earlier !== undefined) {
          issues.push({ code: "DUPLICATE_PRODUCT_LINE", severity: "warning", category: "product", lineNo: line.line_no, message: `Same product as line ${earlier} — confirm both lines are intended.` });
        } else {
          seen.set(match.product.id, line.line_no);
        }
      }
    }
    return issues;
  },
};

const quantityValidator: OrderValidator = {
  id: "quantity",
  category: "quantity",
  run(ctx) {
    return ctx.lines
      .filter(({ line }) => !(Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0))
      .map(({ line }) => ({
        code: "INVALID_QUANTITY",
        severity: "error" as const,
        category: "quantity" as const,
        lineNo: line.line_no,
        message: `Quantity ${line.quantity} is not a positive number.`,
      }));
  },
};

const priceValidator: OrderValidator = {
  id: "price",
  category: "price",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    for (const lineCtx of ctx.lines) {
      const { line, match, expectedPrice, priceError } = lineCtx;
      if (!match.product) continue;
      if (priceError) {
        issues.push({ code: "PRICE_LOOKUP_FAILED", severity: "error", category: "price", lineNo: line.line_no, message: priceError });
        continue;
      }
      const supplied = line.unit_price === null || line.unit_price === undefined ? null : Number(line.unit_price);
      const expected = expectedPrice && expectedPrice.sellingPrice > 0 ? expectedPrice.sellingPrice : null;
      const sourceLabel = expectedPrice ? expectedPrice.source.replace("_", " ") : "";
      if (supplied === null && expected === null) {
        issues.push({ code: "PRICE_MISSING", severity: "error", category: "price", lineNo: line.line_no, message: "No price on the order and no customer or standard price in VOLORA." });
      } else if (supplied !== null && supplied < 0) {
        issues.push({ code: "PRICE_NEGATIVE", severity: "error", category: "price", lineNo: line.line_no, message: `Unit price ${supplied} is negative.` });
      } else if (supplied === 0) {
        // The sales-order engine replaces a zero price with the product-master
        // price, so a free line cannot be handed off without changing its price.
        issues.push({
          code: "PRICE_ZERO",
          severity: "error",
          category: "price",
          lineNo: line.line_no,
          message: "Zero-priced lines cannot be confirmed: Sales Orders would substitute the standard price. Correct the price or remove the line.",
        });
      } else if (supplied !== null && expected !== null && Math.abs(supplied - expected) > PRICE_TOLERANCE) {
        issues.push({
          code: "PRICE_MISMATCH",
          severity: "warning",
          category: "price",
          lineNo: line.line_no,
          message: `Order price ${supplied.toFixed(2)} differs from the ${sourceLabel} price ${expected.toFixed(2)}.`,
          data: { supplied, expected, source: expectedPrice!.source },
        });
      } else if (supplied === null && expected !== null) {
        issues.push({ code: "PRICE_FROM_VYRON", severity: "info", category: "price", lineNo: line.line_no, message: `No price on the order; the ${sourceLabel} price ${expected.toFixed(2)} will be used.` });
      }
    }
    return issues;
  },
};

const stockValidator: OrderValidator = {
  id: "stock",
  category: "stock",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const demand = new Map<string, { qty: number; lineNos: number[]; ctx: LineContext }>();
    for (const lineCtx of ctx.lines) {
      if (!lineCtx.match.product || !lineCtx.stock) continue;
      const id = lineCtx.match.product.id;
      const entry = demand.get(id) || { qty: 0, lineNos: [], ctx: lineCtx };
      entry.qty = round4(entry.qty + Number(lineCtx.line.quantity || 0));
      entry.lineNos.push(lineCtx.line.line_no);
      demand.set(id, entry);
    }
    for (const [, entry] of demand) {
      const stock = entry.ctx.stock!;
      const available = round4((stock.onHand ?? 0) - stock.reservedElsewhere);
      const shortfall = round4(entry.qty - available);
      if (shortfall <= 0) continue;
      const name = entry.ctx.match.product!.product_name || "Product";
      issues.push({
        code: "INSUFFICIENT_STOCK",
        severity: "warning",
        category: "stock",
        lineNo: entry.lineNos[0],
        message: stock.hasStockRecord
          ? `${name}: ordered ${entry.qty}, available ${available} (on hand ${stock.onHand ?? 0}, reserved by other orders ${stock.reservedElsewhere}) — short ${shortfall}.`
          : `${name}: no finished-goods stock record — short ${shortfall}.`,
        data: { ordered: entry.qty, available, onHand: stock.onHand, reservedElsewhere: stock.reservedElsewhere, shortfall },
      });
      if (entry.ctx.hasBom) {
        const requirement = productionRequirementFor(ctx, entry.ctx.match.product!.id, entry.lineNos[0], entry.qty, available, shortfall);
        issues.push({
          code: "PRODUCTION_REQUIRED",
          severity: "info",
          category: "production",
          lineNo: entry.lineNos[0],
          message: `${name}: ${shortfall} to be produced — a BOM exists.`,
          data: { quantity: shortfall, ordered: entry.qty, availableFinished: available, bom: requirement?.bomName ?? null },
        });
        if (requirement && requirement.componentsAvailable === false) {
          const short = requirement.components.filter((c) => c.shortfall !== null && c.shortfall > 0);
          issues.push({
            code: "COMPONENT_SHORTAGE",
            severity: "warning",
            category: "production",
            lineNo: entry.lineNos[0],
            message: `${name}: producing ${shortfall} needs more ${short.map((c) => c.name).join(", ")} than is in stock (estimate from the BOM).`,
            data: { components: short.map((c) => ({ name: c.name, required: c.required, available: c.available, shortfall: c.shortfall, unit: c.unit })) },
          });
        }
      } else if (entry.ctx.hasBom === false) {
        issues.push({ code: "NO_BOM_FOR_SHORTFALL", severity: "warning", category: "production", lineNo: entry.lineNos[0], message: `${name}: short ${shortfall} and no BOM exists to produce it.` });
      }
    }
    return issues;
  },
};

const marginValidator: OrderValidator = {
  id: "margin",
  category: "margin",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    let notMeasured = 0;
    for (const lineCtx of ctx.lines) {
      const product = lineCtx.match.product;
      if (!product) continue;
      const cost = product.total_cost === null || product.total_cost === undefined ? null : Number(product.total_cost);
      const net = netAmount(lineCtx.line, effectivePrice(lineCtx));
      if (cost === null || !(cost > 0)) {
        notMeasured++;
        continue;
      }
      if (net !== null && net < round2(cost * Number(lineCtx.line.quantity))) {
        // No cost figure in any margin message: messages are shown to members who may not see cost.
        issues.push({ code: "NEGATIVE_MARGIN", severity: "warning", category: "margin", lineNo: lineCtx.line.line_no, message: `${product.product_name}: selling below the current product cost.` });
      }
    }
    if (notMeasured > 0) {
      issues.push({ code: "MARGIN_NOT_MEASURED", severity: "info", category: "margin", message: `Margin not measured for ${notMeasured} line(s): no product cost in VOLORA.` });
    }
    const minGp = ctx.policy?.policy.min_gp_pct;
    if (minGp !== null && minGp !== undefined) {
      const { net, cost } = costedTotals(ctx);
      if (net > 0) {
        const gpPct = round2(((net - cost) / net) * 100);
        if (gpPct < Number(minGp)) {
          issues.push({ code: "LOW_MARGIN", severity: "warning", category: "margin", message: "Expected margin is below this customer's minimum.", data: { minimumPct: Number(minGp) } });
        }
      }
    }
    return issues;
  },
};

const commercialValidator: OrderValidator = {
  id: "commercial",
  category: "commercial",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const due = ctx.intake.requested_delivery_date;
    if (due && due < ctx.today) {
      issues.push({ code: "DELIVERY_DATE_PAST", severity: "warning", category: "commercial", message: `Requested delivery date ${due} is in the past.` });
    }
    const settings = ctx.settings || DEFAULT_SETTINGS;
    const duplicateSeverity = settings.duplicatePoAction === "block" ? ("error" as const) : ("warning" as const);
    if (ctx.samePoIntakes.length) {
      issues.push({
        code: "POSSIBLE_DUPLICATE_PO",
        severity: duplicateSeverity,
        category: "commercial",
        message: `PO ${ctx.intake.customer_po_number} was already received for this customer (${ctx.samePoIntakes.map((row) => `${row.intake_number} ${row.status}`).join(", ")}).`,
        data: { intakes: ctx.samePoIntakes, original: ctx.intake.customer_po_number },
      });
    }
    if (ctx.sameReferenceIntakes?.length) {
      issues.push({
        code: "POSSIBLE_DUPLICATE_ORDER",
        severity: duplicateSeverity,
        category: "commercial",
        message: `Order reference ${ctx.intake.external_order_number} was already received (${ctx.sameReferenceIntakes.map((row) => `${row.intake_number} via ${row.source}, ${row.status}`).join("; ")}).`,
        data: { intakes: ctx.sameReferenceIntakes, original: ctx.intake.external_order_number },
      });
    }
    if (settings.minLeadTimeDays !== null && due) {
      // Measured from the validation date: approval re-validates, so the check is always "from now".
      const earliest = addDays(ctx.today, settings.minLeadTimeDays);
      if (earliest && due < earliest) {
        issues.push({
          code: "DELIVERY_LEAD_TIME",
          severity: "warning",
          category: "commercial",
          message: `Requested delivery ${due} is inside the ${settings.minLeadTimeDays}-day lead time (earliest ${earliest}).`,
          data: { original: due, expected: `on or after ${earliest}` },
        });
      }
    }
    if (!ctx.lines.length) {
      issues.push({ code: "NO_LINES", severity: "error", category: "commercial", message: "The order has no lines." });
    }
    return issues;
  },
};

const arithmeticValidator: OrderValidator = {
  id: "arithmetic",
  category: "arithmetic",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    let computedSubtotal = 0;
    let complete = true;
    for (const { line } of ctx.lines) {
      const supplied = line.unit_price === null || line.unit_price === undefined ? null : Number(line.unit_price);
      const net = netAmount(line, supplied);
      if (net === null) complete = false;
      else computedSubtotal += net;
      if (net !== null && line.line_total !== null && line.line_total !== undefined && Math.abs(Number(line.line_total) - net) > AMOUNT_TOLERANCE) {
        issues.push({
          code: "LINE_TOTAL_MISMATCH",
          severity: "warning",
          category: "arithmetic",
          lineNo: line.line_no,
          message: `Stated line total ${Number(line.line_total).toFixed(2)} ≠ quantity × price − discount = ${net.toFixed(2)}.`,
        });
      }
    }
    const statedSubtotal = ctx.intake.supplied_subtotal;
    if (complete && statedSubtotal !== null && statedSubtotal !== undefined && ctx.lines.length && Math.abs(Number(statedSubtotal) - round2(computedSubtotal)) > AMOUNT_TOLERANCE) {
      issues.push({
        code: "SUBTOTAL_MISMATCH",
        severity: "warning",
        category: "arithmetic",
        message: `Stated subtotal ${Number(statedSubtotal).toFixed(2)} ≠ sum of lines ${round2(computedSubtotal).toFixed(2)}.`,
      });
    }
    return issues;
  },
};

/** Customer order policy rules — each runs only when the policy switches it on. */
const policyValidator: OrderValidator = {
  id: "policy",
  category: "policy",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const policy = ctx.policy?.policy;
    if (!policy) return issues;
    const who = ctx.policy!.scope === "customer" ? "this customer" : "your company's default ordering rules";
    if (policy.require_po && !String(ctx.intake.customer_po_number || "").trim()) {
      issues.push({ code: "MISSING_PO", severity: "error", category: "policy", message: `A PO number is required for ${who}.` });
    }
    if (policy.require_delivery_date && !ctx.intake.requested_delivery_date) {
      issues.push({ code: "MISSING_DELIVERY_DATE", severity: "error", category: "policy", message: `A requested delivery date is required for ${who}.` });
    }
    if (policy.min_order_value !== null && policy.min_order_value !== undefined) {
      const { subtotal } = costedTotals(ctx);
      if (subtotal !== null && subtotal < Number(policy.min_order_value)) {
        issues.push({
          code: "BELOW_MINIMUM_ORDER",
          severity: "warning",
          category: "policy",
          message: `Order value ${subtotal.toFixed(2)} is below the minimum order of ${Number(policy.min_order_value).toFixed(2)} for ${who}.`,
        });
      }
    }
    if (policy.delivery_weekdays?.length && ctx.intake.requested_delivery_date) {
      const weekday = isoWeekday(ctx.intake.requested_delivery_date);
      if (weekday && !policy.delivery_weekdays.includes(weekday)) {
        issues.push({
          code: "DELIVERY_DAY_NOT_ALLOWED",
          severity: "warning",
          category: "policy",
          message: `${WEEKDAY_NAMES[weekday]} is not a delivery day for ${who} (${policy.delivery_weekdays.map((d) => WEEKDAY_NAMES[d]).join(", ")}).`,
        });
      }
    }
    if (policy.enforce_case_quantity) {
      for (const lineCtx of ctx.lines) {
        const perCase = lineCtx.unitsPerCase;
        const quantity = Number(lineCtx.line.quantity);
        if (perCase && perCase > 0 && quantity > 0 && Math.abs(quantity / perCase - Math.round(quantity / perCase)) > 1e-9) {
          issues.push({
            code: "CASE_QUANTITY",
            severity: "warning",
            category: "policy",
            lineNo: lineCtx.line.line_no,
            message: `${quantity} is not a whole number of cases of ${perCase}.`,
          });
        }
      }
    }
    if (String(policy.special_instructions || "").trim()) {
      issues.push({ code: "SPECIAL_INSTRUCTIONS", severity: "info", category: "policy", message: String(policy.special_instructions).trim() });
    }
    return issues;
  },
};

/** What the source said about tax and shipping. Nothing is assumed: only stated facts are checked. */
const taxValidator: OrderValidator = {
  id: "tax",
  category: "tax",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    if (ctx.intake.prices_include_tax === true) {
      issues.push({
        code: "PRICES_INCLUDE_TAX",
        severity: "error",
        category: "tax",
        message: "The source states its prices include tax. Sales Orders price ex-tax and add tax on top — enter ex-tax prices and confirm the conversion.",
      });
    }
    const facts = (ctx.intake.extraction as ExtractionMeta | undefined)?.sourceFacts;
    if (facts?.refundedTotal && Number(facts.refundedTotal) > 0) {
      issues.push({
        code: "SOURCE_PARTIAL_REFUND",
        severity: "warning",
        category: "tax",
        message: `The source has already refunded ${Number(facts.refundedTotal).toFixed(2)} on this order. The lines are shown as ordered; confirm what is still to be supplied.`,
      });
    }
    if (facts?.couponCodes?.length) {
      issues.push({ code: "COUPON_APPLIED", severity: "info", category: "tax", message: `Coupon(s) applied at source: ${facts.couponCodes.join(", ")}. Line discounts already include them.` });
    }
    const shipping = ctx.intake.supplied_shipping_total;
    if (shipping !== null && shipping !== undefined && Number(shipping) > 0) {
      issues.push({
        code: "SHIPPING_NOT_CARRIED",
        severity: "warning",
        category: "tax",
        message: `The source states a shipping charge of ${Number(shipping).toFixed(2)}. It is not added to the sales order.`,
      });
    }
    return issues;
  },
};

function extractionIssues(meta: ExtractionMeta | Record<string, never> | null | undefined, lineNo?: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!meta || !("method" in meta || "fields" in meta)) return issues;
  const m = meta as ExtractionMeta;
  const automatic = m.method === "ai" || m.method === "ocr";
  const uncertain = Object.entries(m.fields || {}).filter(([, f]) => f.confidence === "LOW");
  for (const [field, f] of uncertain) {
    issues.push({
      code: "EXTRACTION_LOW_CONFIDENCE",
      severity: "error",
      category: "extraction",
      lineNo,
      message: `The ${field} was read with low confidence${f.source ? ` (${f.source})` : ""} — confirm it against the original.`,
      data: { field, method: f.method, source: f.source ?? null },
    });
  }
  if (automatic && !uncertain.length) {
    issues.push({ code: "EXTRACTION_REVIEW", severity: "warning", category: "extraction", lineNo, message: `Read automatically (${m.method}) — check against the original document.` });
  }
  return issues;
}

/** AI / OCR output is a candidate: always reviewed, and uncertain values block. */
const extractionValidator: OrderValidator = {
  id: "extraction",
  category: "extraction",
  run(ctx) {
    const issues = [...extractionIssues(ctx.intake.extraction), ...ctx.lines.flatMap(({ line }) => extractionIssues(line.extraction, line.line_no))];
    // The extractor's own overall confidence for the document.
    const overall = ctx.intake.extraction_confidence ?? (ctx.intake.extraction as ExtractionMeta | undefined)?.confidence ?? null;
    if (overall === "LOW") {
      issues.push({
        code: "EXTRACTION_LOW_CONFIDENCE",
        severity: "error",
        category: "extraction",
        message: "The document was read with low overall confidence — check every value against the original.",
        data: { field: "order", confidence: "LOW" },
      });
    } else if (overall === "MEDIUM" && !issues.some((i) => i.code === "EXTRACTION_REVIEW" || i.code === "EXTRACTION_LOW_CONFIDENCE")) {
      issues.push({ code: "EXTRACTION_REVIEW", severity: "warning", category: "extraction", message: "The document was read with medium confidence — check it against the original." });
    }
    return issues;
  },
};

/** Web-store orders: the decisions a company must make before one can be approved. */
const webChannelValidator: OrderValidator = {
  id: "web_channel",
  category: "commercial",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    if (ctx.intake.source !== "woocommerce" && ctx.intake.source !== "shopify") return issues;
    const settings = ctx.settings || DEFAULT_SETTINGS;
    if (!settings.webOrdersMode) {
      issues.push({
        code: "WEB_ORDERS_MODE_NOT_DECIDED",
        severity: "error",
        category: "commercial",
        message: "It has not been decided whether web-store orders are fulfilled in VOLORA or kept as historical sales. The order is held until someone decides.",
      });
    }
    const eligible = ctx.channel?.eligible_statuses ?? settings.webOrderStatuses ?? null;
    const status = cleanStatus(ctx.intake.source_status);
    if (eligible && status && !eligible.map((s) => s.toLowerCase()).includes(status)) {
      issues.push({
        code: "WEB_STATUS_NOT_ELIGIBLE",
        severity: "error",
        category: "commercial",
        message: `The store status "${ctx.intake.source_status}" is not one this company fulfils (${eligible.join(", ")}).`,
        data: { original: ctx.intake.source_status, expected: eligible.join(", ") },
      });
    }
    // The store's stated VAT basis, when the order itself did not say.
    const channelTax = ctx.channel?.prices_include_tax ?? settings.webPricesIncludeTax ?? null;
    if (ctx.intake.prices_include_tax === null && channelTax === true) {
      issues.push({
        code: "PRICES_INCLUDE_TAX",
        severity: "error",
        category: "tax",
        message: "This store is configured as pricing VAT-inclusive. Sales Orders price ex-tax — enter ex-tax prices and confirm the conversion.",
      });
    }
    if (ctx.intake.prices_include_tax === null && channelTax === null) {
      issues.push({
        code: "WEB_VAT_BASIS_UNKNOWN",
        severity: "warning",
        category: "tax",
        message: "Neither the order nor the channel states whether store prices include VAT. Confirm before approving.",
      });
    }
    return issues;
  },
};

const cleanStatus = (value: unknown) => String(value ?? "").trim().toLowerCase() || null;

/** B2B / B2C: web orders from unknown customers need a business decision before they can be booked. */
const contextValidator: OrderValidator = {
  id: "context",
  category: "customer",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    if (ctx.context === "B2C" && ctx.customer.status === "UNMATCHED" && !(ctx.settings || DEFAULT_SETTINGS).b2cCustomerId) {
      issues.push({
        code: "B2C_ACCOUNT_NOT_CONFIGURED",
        severity: "error",
        category: "customer",
        message: "This web-store order is from a customer VOLORA does not know, and no B2C account has been chosen for web orders. It is not booked anywhere until a person decides.",
      });
    }
    if (ctx.context === "UNSPECIFIED") {
      issues.push({ code: "ORDER_CONTEXT_UNSPECIFIED", severity: "info", category: "customer", message: "The source did not say whether this is a trade (B2B) or web (B2C) order." });
    }
    return issues;
  },
};

/** A corrected order is never silently different from what the customer sent. */
const sourceChangeValidator: OrderValidator = {
  id: "source_change",
  category: "commercial",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    for (const { line } of ctx.lines) {
      const snap = line.source_snapshot as LineSourceSnapshot | undefined;
      if (!snap || !("source_quantity" in snap)) continue;
      const changes: string[] = [];
      if (Number.isFinite(Number(snap.source_quantity)) && round4(Number(snap.source_quantity)) !== round4(Number(line.quantity))) {
        changes.push(`quantity ${snap.source_quantity} → ${line.quantity}`);
      }
      const original = snap.source_price === null || snap.source_price === undefined ? null : Number(snap.source_price);
      const current = line.unit_price === null || line.unit_price === undefined ? null : Number(line.unit_price);
      const samePrice = original === null ? current === null : current !== null && Math.abs(original - current) < PRICE_TOLERANCE;
      if (!samePrice) changes.push(`price ${original ?? "none"} → ${current ?? "none"}`);
      if (changes.length) {
        issues.push({
          code: "SOURCE_VALUE_CHANGED",
          severity: "warning",
          category: "commercial",
          lineNo: line.line_no,
          message: `Changed from what the customer sent: ${changes.join(", ")}.`,
          data: { original: { quantity: snap.source_quantity, price: original }, current: { quantity: Number(line.quantity), price: current } },
        });
      }
    }
    const head = ctx.intake.source_snapshot as IntakeSourceSnapshot | undefined;
    if (head && "po_number" in head) {
      const changed: string[] = [];
      if ((head.po_number ?? null) !== (ctx.intake.customer_po_number ?? null)) changed.push(`PO ${head.po_number ?? "none"} → ${ctx.intake.customer_po_number ?? "none"}`);
      const sourceDate = head.requested_delivery_date ? String(head.requested_delivery_date).slice(0, 10) : null;
      if (sourceDate !== (ctx.intake.requested_delivery_date ?? null)) {
        changed.push(`delivery date ${sourceDate ?? "none"} → ${ctx.intake.requested_delivery_date ?? "none"}`);
      }
      if (changed.length) {
        issues.push({
          code: "SOURCE_VALUE_CHANGED",
          severity: "warning",
          category: "commercial",
          message: `Changed from what the customer sent: ${changed.join(", ")}.`,
          data: {
            original: { po: head.po_number, requestedDeliveryDate: sourceDate },
            current: { po: ctx.intake.customer_po_number, requestedDeliveryDate: ctx.intake.requested_delivery_date },
          },
        });
      }
    }
    return issues;
  },
};

export const VALIDATORS: readonly OrderValidator[] = [
  customerValidator,
  productValidator,
  quantityValidator,
  priceValidator,
  stockValidator,
  marginValidator,
  commercialValidator,
  arithmeticValidator,
  policyValidator,
  taxValidator,
  extractionValidator,
  webChannelValidator,
  contextValidator,
  sourceChangeValidator,
];

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

export function runValidators(ctx: ValidationContext, validators: readonly OrderValidator[] = VALIDATORS): ValidationSnapshot {
  const issues = validators.flatMap((validator) => validator.run(ctx));

  const lineStatus = (lineNo: number): LineEvaluation["status"] => {
    const own = issues.filter((issue) => issue.lineNo === lineNo);
    if (own.some((issue) => issue.severity === "error")) return "ERROR";
    if (own.some((issue) => issue.severity === "warning")) return "WARNING";
    return "OK";
  };

  let expectedSubtotal: number | null = 0;
  let expectedCost = 0;
  let costedNet = 0;
  let marginNotMeasuredLines = 0;
  const byRule: Record<string, number> = {};

  const lines: LineEvaluation[] = ctx.lines.map((lineCtx) => {
    const { line, match, expectedPrice, stock } = lineCtx;
    const price = effectivePrice(lineCtx);
    const net = netAmount(line, price);
    const product = match.product;
    if (match.rule) byRule[match.rule] = (byRule[match.rule] || 0) + 1;
    const unitCost = product && product.total_cost !== null && Number(product.total_cost) > 0 ? Number(product.total_cost) : null;
    const lineCost = unitCost !== null ? round2(unitCost * Number(line.quantity)) : null;
    if (net === null) expectedSubtotal = null;
    else if (expectedSubtotal !== null) expectedSubtotal = round2(expectedSubtotal + net);
    if (product) {
      if (lineCost !== null && net !== null) {
        expectedCost = round2(expectedCost + lineCost);
        costedNet = round2(costedNet + net);
      } else {
        marginNotMeasuredLines++;
      }
    }
    const available = stock ? round4((stock.onHand ?? 0) - stock.reservedElsewhere) : null;
    return {
      lineNo: line.line_no,
      productId: product?.id ?? null,
      productName: product?.product_name ?? null,
      sku: product?.sku ?? null,
      matchStatus: match.status,
      matchRule: match.rule,
      quantity: Number(line.quantity),
      suppliedUnitPrice: line.unit_price === null || line.unit_price === undefined ? null : Number(line.unit_price),
      expectedUnitPrice: expectedPrice && expectedPrice.sellingPrice > 0 ? expectedPrice.sellingPrice : null,
      priceSource: expectedPrice?.source ?? null,
      effectiveUnitPrice: price,
      netAmount: net,
      unitCost,
      lineCost,
      lineGp: lineCost !== null && net !== null ? round2(net - lineCost) : null,
      onHand: stock ? stock.onHand : null,
      reservedElsewhere: stock ? stock.reservedElsewhere : null,
      available,
      shortfall: available !== null ? Math.max(0, round4(Number(line.quantity) - available)) : null,
      hasBom: lineCtx.hasBom,
      status: lineStatus(line.line_no),
    };
  });

  const expectedGp = costedNet > 0 || expectedCost > 0 ? round2(costedNet - expectedCost) : null;
  const counts = {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };

  return {
    version: 1,
    validatedAt: new Date().toISOString(),
    customer: { id: ctx.customer.customer?.id ?? null, name: ctx.customer.customer?.customer_name ?? null, matchRule: ctx.customer.rule },
    policy: ctx.policy ? { id: ctx.policy.policy.id, scope: ctx.policy.scope } : null,
    issues,
    lines,
    totals: {
      expectedSubtotal,
      expectedCost: expectedCost > 0 ? expectedCost : null,
      expectedGp,
      expectedGpPct: expectedGp !== null && costedNet > 0 ? round2((expectedGp / costedNet) * 100) : null,
      marginNotMeasuredLines,
    },
    counts,
    matching: {
      matched: ctx.lines.filter((l) => l.match.status === "MATCHED").length,
      unmatched: ctx.lines.filter((l) => l.match.status === "UNMATCHED").length,
      ambiguous: ctx.lines.filter((l) => l.match.status === "AMBIGUOUS").length,
      byRule,
    },
    context: ctx.context ?? "UNSPECIFIED",
    production: productionRequirements(ctx),
    settings: {
      b2cAccountConfigured: Boolean((ctx.settings || DEFAULT_SETTINGS).b2cCustomerId),
      productNameMatching: (ctx.settings || DEFAULT_SETTINGS).productNameMatching,
      duplicatePoAction: (ctx.settings || DEFAULT_SETTINGS).duplicatePoAction,
      minLeadTimeDays: (ctx.settings || DEFAULT_SETTINGS).minLeadTimeDays,
    },
  };
}

function addDays(date: string, days: number): string | null {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Estimate what producing a shortfall takes, from the product's BOM:
 * required = shortfall × BOM quantity × (1 + wastage) ÷ BOM yield. Units are
 * compared only when the BOM line and the stock item state the same unit —
 * nothing is converted. It is an estimate for planning; nothing is produced,
 * reserved or purchased.
 */
function productionRequirementFor(
  ctx: ValidationContext,
  productId: string,
  lineNo: number,
  ordered: number,
  availableFinished: number,
  shortfall: number
): ProductionRequirement | null {
  const bom = ctx.production?.get(productId);
  if (!bom) return null;
  const lineCtx = ctx.lines.find((l) => l.match.product?.id === productId);
  const yieldQty = bom.yieldQty && bom.yieldQty > 0 ? bom.yieldQty : 1;
  const components: ProductionComponent[] = bom.note
    ? []
    : bom.lines.map((l) => {
        const required = round4((shortfall * l.quantity * (1 + (l.wastagePct || 0) / 100)) / yieldQty);
        const sameUnit = !l.unit || !l.stockUnit || normalizeName(l.unit) === normalizeName(l.stockUnit);
        const available = l.hasStock && sameUnit ? l.stockQty : null;
        const note = !l.ingredientId
          ? "Not a stock-tracked component."
          : !l.hasStock
            ? "No stock record for this component."
            : !sameUnit
              ? `Units differ (BOM ${l.unit}, stock ${l.stockUnit}) — not compared.`
              : null;
        return {
          ingredientId: l.ingredientId,
          name: l.name,
          unit: l.unit,
          required,
          available,
          shortfall: available === null ? null : Math.max(0, round4(required - available)),
          note,
        };
      });
  const measured = components.filter((c) => c.available !== null);
  return {
    lineNo,
    productId,
    productName: lineCtx?.match.product?.product_name ?? null,
    quantityRequired: ordered,
    availableFinished: Math.max(0, availableFinished),
    shortfall,
    bomId: bom.bomId,
    bomName: bom.bomName ?? bom.note,
    bomYield: bom.yieldQty,
    components,
    componentsAvailable: bom.note || !measured.length ? null : measured.every((c) => (c.shortfall ?? 0) <= 0),
  };
}

/** Production requirements for every product stock cannot cover. */
function productionRequirements(ctx: ValidationContext): ProductionRequirement[] {
  const demand = new Map<string, { qty: number; lineNo: number; stock: NonNullable<LineContext["stock"]> }>();
  for (const lineCtx of ctx.lines) {
    if (!lineCtx.match.product || !lineCtx.stock || !lineCtx.hasBom) continue;
    const entry = demand.get(lineCtx.match.product.id) || { qty: 0, lineNo: lineCtx.line.line_no, stock: lineCtx.stock };
    entry.qty = round4(entry.qty + Number(lineCtx.line.quantity || 0));
    demand.set(lineCtx.match.product.id, entry);
  }
  const out: ProductionRequirement[] = [];
  for (const [productId, entry] of demand) {
    const available = round4((entry.stock.onHand ?? 0) - entry.stock.reservedElsewhere);
    const shortfall = round4(entry.qty - available);
    if (shortfall <= 0) continue;
    const requirement = productionRequirementFor(ctx, productId, entry.lineNo, entry.qty, available, shortfall);
    if (requirement) out.push(requirement);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadStock(supabase: SupabaseClient, companyId: string, productIds: string[]) {
  const result = new Map<string, { onHand: number | null; reservedElsewhere: number; hasStockRecord: boolean }>();
  if (!productIds.length) return result;
  const { data: items, error } = await supabase
    .from("vyron_cost_stock_items")
    .select("entity_id, qty_on_hand")
    .eq("company_id", companyId)
    .eq("entity_type", "finished_goods")
    .in("entity_id", productIds);
  if (error && !isMissingRelation(error)) raiseDbError(error, "Stock lookup failed");
  // Only live sales orders hold stock (shared rule with the sales-order engine).
  const reserved = await loadReservedQuantities(supabase, companyId, productIds);
  const onHand = new Map<string, number>();
  for (const row of (items || []) as Array<{ entity_id: string; qty_on_hand: number | null }>) {
    const key = String(row.entity_id);
    onHand.set(key, round4((onHand.get(key) || 0) + Number(row.qty_on_hand || 0)));
  }
  for (const id of productIds) {
    result.set(id, { onHand: onHand.has(id) ? onHand.get(id)! : null, reservedElsewhere: reserved.get(id) || 0, hasStockRecord: onHand.has(id) });
  }
  return result;
}

async function loadBomPresence(supabase: SupabaseClient, companyId: string, productIds: string[]): Promise<Map<string, boolean> | null> {
  if (!productIds.length) return new Map();
  const { data, error } = await supabase.from("vyron_cost_boms").select("product_id").eq("company_id", companyId).in("product_id", productIds);
  if (error) {
    if (isMissingRelation(error)) return null;
    raiseDbError(error, "BOM lookup failed");
  }
  const withBom = new Set(((data || []) as Array<{ product_id: string | null }>).map((row) => String(row.product_id)));
  return new Map(productIds.map((id) => [id, withBom.has(id)]));
}

async function loadPackSizes(supabase: SupabaseClient, companyId: string, productIds: string[]): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const { data, error } = await supabase
    .from("vyron_cost_product_pack_sizes")
    .select("product_id, units_per_box, confidence")
    .eq("company_id", companyId)
    .in("product_id", productIds);
  if (error) {
    if (isMissingRelation(error)) return new Map();
    raiseDbError(error, "Pack size lookup failed");
  }
  // Only confirmed pack sizes are enforced; a provisional figure is not a rule.
  return new Map(
    ((data || []) as Array<{ product_id: string; units_per_box: number; confidence: string | null }>)
      .filter((row) => (row.confidence || "Confirmed") === "Confirmed" && Number(row.units_per_box) > 0)
      .map((row) => [String(row.product_id), Number(row.units_per_box)])
  );
}

/** The customer's own policy, else the company default, else none. */
export async function loadOrderPolicy(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string | null
): Promise<{ policy: CustomerOrderPolicy; scope: "customer" | "company" } | null> {
  const { data, error } = await supabase.from("vyron_customer_order_policies").select("*").eq("company_id", companyId);
  if (error) {
    if (isMissingRelation(error)) return null;
    raiseDbError(error, "Order policy lookup failed");
  }
  const rows = (data || []) as CustomerOrderPolicy[];
  const own = customerId ? rows.find((row) => row.customer_id === customerId) : undefined;
  if (own) return { policy: own, scope: "customer" };
  const fallback = rows.find((row) => row.customer_id === null || row.customer_id === undefined);
  return fallback ? { policy: fallback, scope: "company" } : null;
}

/** Read everything validation needs, once. `today` is injectable for tests. */
export async function loadValidationContext(
  supabase: SupabaseClient,
  intake: IntakeRow,
  lines: IntakeLineRow[],
  options: { today?: string } = {}
): Promise<ValidationContext> {
  const companyId = intake.company_id;
  const settings = await loadOrderSettings(supabase, companyId);
  const head = (intake.source_snapshot || {}) as Partial<IntakeSourceSnapshot>;
  const channel =
    intake.source === "woocommerce" || intake.source === "shopify"
      ? await loadChannelSettings(supabase, companyId, head.catalog_system || intake.source)
      : null;
  const context: OrderContext = (intake.order_context as OrderContext) || "UNSPECIFIED";
  // Only a person's explicit choice is carried forward as an id. An automatic
  // match is re-derived every run, so its rule (and any warning) is never lost.
  let customer = await matchCustomer(supabase, companyId, {
    customerId: intake.customer_match_rule === "customer_id" ? intake.customer_id : null,
    customerName: intake.customer_name,
    senderEmail: intake.source === "email" ? intake.customer_reference : null,
    source: intake.source,
    customerReference: intake.customer_reference,
    externalCustomerId: head.external_customer_id ?? null,
    catalogSystem: head.catalog_system ?? null,
  });
  // A web order from an unknown customer is booked against the company's B2C
  // account — only when the company has chosen one.
  if (customer.status === "UNMATCHED" && context === "B2C" && settings.b2cCustomerId) {
    const account = await matchCustomer(supabase, companyId, { customerId: settings.b2cCustomerId });
    if (account.status === "MATCHED") customer = { ...account, rule: "b2c_account", reason: "Web order booked against the company's B2C account." };
  }

  const matcher = await createProductMatcher(supabase, companyId, {
    customerId: customer.customer?.id ?? null,
    rawSkus: lines.map((line) => line.raw_sku),
    catalogSystem: head.catalog_system ?? null,
    nameMatching: settings.productNameMatching,
  });
  const matches: ProductMatch[] = [];
  for (const line of lines) {
    const snap = (line.source_snapshot || {}) as Partial<LineSourceSnapshot>;
    matches.push(
      await matcher.match({
        productId: line.match_rule === "manual" ? line.product_id : null,
        rawSku: line.raw_sku,
        rawDescription: line.raw_description,
        externalProductId: snap.source_external_product_id ?? null,
      })
    );
  }

  const productIds = [...new Set(matches.map((m) => m.product?.id).filter(Boolean) as string[])];
  const policy = await loadOrderPolicy(supabase, companyId, customer.customer?.id ?? null);
  const [stock, bom, packSizes] = await Promise.all([
    loadStock(supabase, companyId, productIds),
    loadBomPresence(supabase, companyId, productIds),
    policy?.policy.enforce_case_quantity ? loadPackSizes(supabase, companyId, productIds) : Promise.resolve(new Map<string, number>()),
  ]);

  // One price lookup per product, not per line.
  const priceCache = new Map<string, { expectedPrice: LineContext["expectedPrice"]; priceError: string | null }>();
  const lineContexts: LineContext[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = matches[index];
    let priced: { expectedPrice: LineContext["expectedPrice"]; priceError: string | null } = { expectedPrice: null, priceError: null };
    if (match.product) {
      const cached = priceCache.get(match.product.id);
      if (cached) priced = cached;
      else {
        try {
          const price = await resolveCustomerProductPrice(supabase, companyId, {
            customerId: customer.customer?.id ?? null,
            productId: match.product.id,
            asOfDate: intake.order_date || undefined,
          });
          priced = { expectedPrice: { sellingPrice: Number(price.sellingPrice || 0), source: price.source, priceListId: price.priceListId }, priceError: null };
        } catch (error) {
          priced = { expectedPrice: null, priceError: error instanceof Error ? error.message : "Price lookup failed." };
        }
        priceCache.set(match.product.id, priced);
      }
    }
    lineContexts.push({
      line,
      match,
      ...priced,
      stock: match.product ? stock.get(match.product.id) || null : null,
      hasBom: match.product && bom ? bom.get(match.product.id) ?? false : null,
      unitsPerCase: match.product ? packSizes.get(match.product.id) ?? null : null,
    });
  }

  let samePoIntakes: ValidationContext["samePoIntakes"] = [];
  if (intake.customer_po_number && customer.customer) {
    const { data, error } = await supabase
      .from("vyron_order_intakes")
      .select("id, intake_number, status, customer_id, customer_po_number")
      .eq("company_id", companyId)
      .eq("customer_id", customer.customer.id)
      .eq("customer_po_number", intake.customer_po_number);
    if (error) raiseDbError(error, "Duplicate PO lookup failed");
    samePoIntakes = ((data || []) as Array<{ id: string; intake_number: string; status: string }>)
      .filter((row) => row.id !== intake.id && !["REJECTED", "CANCELLED"].includes(row.status))
      .map((row) => ({ id: row.id, intake_number: row.intake_number, status: row.status }));
  }

  let sameReferenceIntakes: NonNullable<ValidationContext["sameReferenceIntakes"]> = [];
  if (intake.external_order_number) {
    const { data, error } = await supabase
      .from("vyron_order_intakes")
      .select("id, intake_number, status, source, external_order_number")
      .eq("company_id", companyId)
      .eq("external_order_number", intake.external_order_number);
    if (error) raiseDbError(error, "Duplicate reference lookup failed");
    sameReferenceIntakes = ((data || []) as Array<{ id: string; intake_number: string; status: string; source: string }>)
      .filter((row) => row.id !== intake.id && !["REJECTED", "CANCELLED"].includes(row.status))
      .map((row) => ({ id: row.id, intake_number: row.intake_number, status: row.status, source: row.source }));
  }

  // BOM detail only for products whose demand stock cannot cover.
  const demand = new Map<string, number>();
  lineContexts.forEach((l) => {
    if (l.match.product) demand.set(l.match.product.id, round4((demand.get(l.match.product.id) || 0) + Number(l.line.quantity || 0)));
  });
  const shortProducts = [...demand.entries()]
    .filter(([id, qty]) => {
      const s = stock.get(id);
      return s && bom?.get(id) && qty > round4((s.onHand ?? 0) - s.reservedElsewhere);
    })
    .map(([id]) => id);
  const production = await loadProductionBoms(supabase, companyId, shortProducts);

  return {
    intake,
    customer,
    lines: lineContexts,
    samePoIntakes,
    sameReferenceIntakes,
    policy,
    settings,
    channel,
    context,
    production,
    today: options.today || new Date().toISOString().slice(0, 10),
  };
}

/** The BOM (and component stock) of each product, for production estimates. */
async function loadProductionBoms(supabase: SupabaseClient, companyId: string, productIds: string[]): Promise<Map<string, ProductionBom>> {
  const result = new Map<string, ProductionBom>();
  if (!productIds.length) return result;
  const { data: boms, error } = await supabase
    .from("vyron_cost_boms")
    .select("id, product_id, bom_name, yield_qty")
    .eq("company_id", companyId)
    .in("product_id", productIds);
  if (error) {
    if (isMissingRelation(error)) return result;
    raiseDbError(error, "BOM lookup failed");
  }
  const byProduct = new Map<string, Array<{ id: string; bom_name: string | null; yield_qty: number | null }>>();
  for (const row of (boms || []) as Array<{ id: string; product_id: string; bom_name: string | null; yield_qty: number | null }>) {
    byProduct.set(String(row.product_id), [...(byProduct.get(String(row.product_id)) || []), row]);
  }
  const chosen = new Map<string, { id: string; bom_name: string | null; yield_qty: number | null }>();
  for (const [productId, rows] of byProduct) {
    if (rows.length === 1) chosen.set(productId, rows[0]);
    else result.set(productId, { bomId: null, bomName: null, yieldQty: null, note: `${rows.length} BOMs exist for this product — no single BOM to estimate from.`, lines: [] });
  }
  const bomIds = [...chosen.values()].map((b) => b.id);
  if (!bomIds.length) return result;
  const { data: bomLines, error: lineError } = await supabase
    .from("vyron_cost_bom_lines")
    .select("bom_id, ingredient_id, line_name, quantity, unit, wastage_percent, line_type, sort_order")
    .eq("company_id", companyId)
    .in("bom_id", bomIds);
  if (lineError) {
    if (isMissingRelation(lineError)) return result;
    raiseDbError(lineError, "BOM line lookup failed");
  }
  const lineRows = (bomLines || []) as Array<{
    bom_id: string;
    ingredient_id: string | null;
    line_name: string | null;
    quantity: number | null;
    unit: string | null;
    wastage_percent: number | null;
    line_type: string | null;
    sort_order: number | null;
  }>;
  const ingredientIds = [...new Set(lineRows.map((l) => l.ingredient_id).filter(Boolean) as string[])];
  const componentStock = new Map<string, { qty: number; unit: string | null }>();
  if (ingredientIds.length) {
    const { data: items, error: stockError } = await supabase
      .from("vyron_cost_stock_items")
      .select("entity_id, qty_on_hand, unit")
      .eq("company_id", companyId)
      .eq("entity_type", "ingredient")
      .in("entity_id", ingredientIds);
    if (stockError && !isMissingRelation(stockError)) raiseDbError(stockError, "Component stock lookup failed");
    for (const row of (items || []) as Array<{ entity_id: string; qty_on_hand: number | null; unit: string | null }>) {
      const key = String(row.entity_id);
      const existing = componentStock.get(key);
      componentStock.set(key, { qty: round4((existing?.qty || 0) + Number(row.qty_on_hand || 0)), unit: existing?.unit ?? row.unit ?? null });
    }
  }
  for (const [productId, b] of chosen) {
    const own = lineRows
      .filter((l) => l.bom_id === b.id && String(l.line_type || "ingredient").toLowerCase() !== "labour" && Number(l.quantity) > 0)
      .sort((x, y) => Number(x.sort_order ?? 0) - Number(y.sort_order ?? 0));
    result.set(productId, {
      bomId: b.id,
      bomName: b.bom_name,
      yieldQty: b.yield_qty === null || b.yield_qty === undefined ? null : Number(b.yield_qty),
      note: null,
      lines: own.map((l) => {
        const s = l.ingredient_id ? componentStock.get(l.ingredient_id) : undefined;
        return {
          ingredientId: l.ingredient_id,
          name: String(l.line_name || "Component"),
          quantity: Number(l.quantity),
          unit: l.unit,
          wastagePct: Number(l.wastage_percent || 0),
          stockQty: s ? s.qty : null,
          stockUnit: s ? s.unit : null,
          hasStock: Boolean(s),
        };
      }),
    });
  }
  return result;
}

export { loadProductsById, type ProductRecord };
