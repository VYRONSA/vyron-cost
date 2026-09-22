import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCustomerProductPrice } from "@/lib/vyron-customer-price-lists";
import { isMissingRelation, raiseDbError } from "@/lib/order-engine/errors";
import {
  loadProductsById,
  matchCustomer,
  matchProductForLine,
  type CustomerMatch,
  type ProductMatch,
  type ProductRecord,
} from "@/lib/order-engine/matching";
import { round2, round4 } from "@/lib/order-engine/normalize";
import type {
  IntakeLineRow,
  IntakeRow,
  IssueCategory,
  LineEvaluation,
  ValidationIssue,
  ValidationSnapshot,
} from "@/lib/order-engine/types";

/**
 * The validation framework.
 *
 * `loadValidationContext` does all reading (customer, product matches, prices,
 * stock, reservations, BOM presence, earlier intakes with the same PO) exactly
 * once. Validators are pure functions over that context: they never touch the
 * database, so each is testable on its own and adding a check is a new entry in
 * VALIDATORS. `error` blocks approval, `warning` must be acknowledged by the
 * approver, `info` is shown.
 */

export type LineContext = {
  line: IntakeLineRow;
  match: ProductMatch;
  expectedPrice: { sellingPrice: number; source: string; priceListId: string | null } | null;
  priceError: string | null;
  stock: { onHand: number | null; reservedElsewhere: number; hasStockRecord: boolean } | null;
  hasBom: boolean | null;
};

export type ValidationContext = {
  intake: IntakeRow;
  customer: CustomerMatch;
  lines: LineContext[];
  /** Other live intakes for the same customer and PO number. */
  samePoIntakes: Array<{ id: string; intake_number: string; status: string }>;
  today: string;
};

export type OrderValidator = {
  id: string;
  category: IssueCategory;
  run(ctx: ValidationContext): ValidationIssue[];
};

const PRICE_TOLERANCE = 0.005;
const AMOUNT_TOLERANCE = 0.01;

function netAmount(line: IntakeLineRow, unitPrice: number | null): number | null {
  if (unitPrice === null) return null;
  const gross = Number(line.quantity) * unitPrice;
  return round2(gross - Number(line.discount_amount || 0));
}

/** The price the order will carry: what the customer stated, else what VYRON expects. */
function effectivePrice(ctx: LineContext): number | null {
  if (ctx.line.unit_price !== null && ctx.line.unit_price !== undefined) return Number(ctx.line.unit_price);
  if (ctx.expectedPrice && ctx.expectedPrice.sellingPrice > 0) return ctx.expectedPrice.sellingPrice;
  return null;
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
      issues.push({
        code: "CUSTOMER_AMBIGUOUS",
        severity: "error",
        category: "customer",
        message: `${match.reason} Choose the customer.`,
        data: { candidates: match.candidates },
      });
      return issues;
    }
    const customer = match.customer!;
    const status = String(customer.status || "").toLowerCase();
    if (customer.active === false || status === "inactive" || status === "archived") {
      issues.push({
        code: "CUSTOMER_INACTIVE",
        severity: "error",
        category: "customer",
        message: `Customer ${customer.customer_name || customer.id} is not active.`,
      });
    }
    if (customer.on_hold === true || status.includes("hold")) {
      issues.push({
        code: "CUSTOMER_ON_HOLD",
        severity: "warning",
        category: "customer",
        message: `Customer ${customer.customer_name || customer.id} is on hold.`,
      });
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
        issues.push({
          code: "PRODUCT_AMBIGUOUS",
          severity: "error",
          category: "product",
          lineNo: line.line_no,
          message: `${match.reason} Choose the product.`,
          data: { candidates: match.candidates },
        });
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
          issues.push({
            code: "DUPLICATE_PRODUCT_LINE",
            severity: "warning",
            category: "product",
            lineNo: line.line_no,
            message: `Same product as line ${earlier} — confirm both lines are intended.`,
          });
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
      if (supplied === null && expected === null) {
        issues.push({
          code: "PRICE_MISSING",
          severity: "error",
          category: "price",
          lineNo: line.line_no,
          message: "No price on the order and no customer or standard price in VYRON.",
        });
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
          message: `Order price ${supplied.toFixed(2)} differs from the ${expectedPrice!.source.replace("_", " ")} price ${expected.toFixed(2)}.`,
          data: { supplied, expected, source: expectedPrice!.source },
        });
      } else if (supplied === null && expected !== null) {
        issues.push({
          code: "PRICE_FROM_VYRON",
          severity: "info",
          category: "price",
          lineNo: line.line_no,
          message: `No price on the order; the ${expectedPrice!.source.replace("_", " ")} price ${expected.toFixed(2)} will be used.`,
        });
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
        issues.push({
          code: "PRODUCTION_REQUIRED",
          severity: "info",
          category: "production",
          lineNo: entry.lineNos[0],
          message: `${name}: ${shortfall} to be produced — a BOM exists.`,
          data: { quantity: shortfall },
        });
      } else if (entry.ctx.hasBom === false) {
        issues.push({
          code: "NO_BOM_FOR_SHORTFALL",
          severity: "warning",
          category: "production",
          lineNo: entry.lineNos[0],
          message: `${name}: short ${shortfall} and no BOM exists to produce it.`,
        });
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
        issues.push({
          code: "NEGATIVE_MARGIN",
          severity: "warning",
          category: "margin",
          lineNo: lineCtx.line.line_no,
          message: `${product.product_name}: selling below the current product cost (${cost.toFixed(2)} per unit).`,
        });
      }
    }
    if (notMeasured > 0) {
      issues.push({
        code: "MARGIN_NOT_MEASURED",
        severity: "info",
        category: "margin",
        message: `Margin not measured for ${notMeasured} line(s): no product cost in VYRON.`,
      });
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
      issues.push({
        code: "DELIVERY_DATE_PAST",
        severity: "warning",
        category: "commercial",
        message: `Requested delivery date ${due} is in the past.`,
      });
    }
    if (ctx.samePoIntakes.length) {
      issues.push({
        code: "POSSIBLE_DUPLICATE_PO",
        severity: "warning",
        category: "commercial",
        message: `PO ${ctx.intake.customer_po_number} was already received for this customer (${ctx.samePoIntakes
          .map((row) => `${row.intake_number} ${row.status}`)
          .join(", ")}).`,
        data: { intakes: ctx.samePoIntakes },
      });
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
      if (net !== null && line.line_total !== null && line.line_total !== undefined) {
        if (Math.abs(Number(line.line_total) - net) > AMOUNT_TOLERANCE) {
          issues.push({
            code: "LINE_TOTAL_MISMATCH",
            severity: "warning",
            category: "arithmetic",
            lineNo: line.line_no,
            message: `Stated line total ${Number(line.line_total).toFixed(2)} ≠ quantity × price − discount = ${net.toFixed(2)}.`,
          });
        }
      }
    }
    const statedSubtotal = ctx.intake.supplied_subtotal;
    if (complete && statedSubtotal !== null && statedSubtotal !== undefined && ctx.lines.length) {
      if (Math.abs(Number(statedSubtotal) - round2(computedSubtotal)) > AMOUNT_TOLERANCE) {
        issues.push({
          code: "SUBTOTAL_MISMATCH",
          severity: "warning",
          category: "arithmetic",
          message: `Stated subtotal ${Number(statedSubtotal).toFixed(2)} ≠ sum of lines ${round2(computedSubtotal).toFixed(2)}.`,
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

  const lines: LineEvaluation[] = ctx.lines.map((lineCtx) => {
    const { line, match, expectedPrice, stock } = lineCtx;
    const price = effectivePrice(lineCtx);
    const net = netAmount(line, price);
    const product = match.product;
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
    customer: {
      id: ctx.customer.customer?.id ?? null,
      name: ctx.customer.customer?.customer_name ?? null,
      matchRule: ctx.customer.rule,
    },
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
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadStock(
  supabase: SupabaseClient,
  companyId: string,
  productIds: string[]
): Promise<Map<string, { onHand: number | null; reservedElsewhere: number; hasStockRecord: boolean }>> {
  const result = new Map<string, { onHand: number | null; reservedElsewhere: number; hasStockRecord: boolean }>();
  if (!productIds.length) return result;

  const { data: items, error } = await supabase
    .from("vyron_cost_stock_items")
    .select("entity_id, qty_on_hand")
    .eq("company_id", companyId)
    .eq("entity_type", "finished_goods")
    .in("entity_id", productIds);
  if (error && !isMissingRelation(error)) raiseDbError(error, "Stock lookup failed");

  // Reservations held by existing sales orders. The sales-order engine does not
  // net these today; the Order Engine does, so a shortage is not hidden.
  const { data: reservations, error: reservationError } = await supabase
    .from("vyron_customer_sales_order_allocations")
    .select("product_id, reserved_qty")
    .eq("company_id", companyId)
    .eq("status", "Reserved")
    .in("product_id", productIds);
  if (reservationError && !isMissingRelation(reservationError)) raiseDbError(reservationError, "Reservation lookup failed");

  const onHand = new Map<string, number>();
  for (const row of (items || []) as Array<{ entity_id: string; qty_on_hand: number | null }>) {
    const key = String(row.entity_id);
    onHand.set(key, round4((onHand.get(key) || 0) + Number(row.qty_on_hand || 0)));
  }
  const reserved = new Map<string, number>();
  for (const row of (reservations || []) as Array<{ product_id: string; reserved_qty: number | null }>) {
    const key = String(row.product_id);
    reserved.set(key, round4((reserved.get(key) || 0) + Number(row.reserved_qty || 0)));
  }
  for (const id of productIds) {
    result.set(id, { onHand: onHand.has(id) ? onHand.get(id)! : null, reservedElsewhere: reserved.get(id) || 0, hasStockRecord: onHand.has(id) });
  }
  return result;
}

async function loadBomPresence(supabase: SupabaseClient, companyId: string, productIds: string[]): Promise<Map<string, boolean> | null> {
  if (!productIds.length) return new Map();
  const { data, error } = await supabase
    .from("vyron_cost_boms")
    .select("product_id")
    .eq("company_id", companyId)
    .in("product_id", productIds);
  if (error) {
    if (isMissingRelation(error)) return null;
    raiseDbError(error, "BOM lookup failed");
  }
  const withBom = new Set(((data || []) as Array<{ product_id: string | null }>).map((row) => String(row.product_id)));
  return new Map(productIds.map((id) => [id, withBom.has(id)]));
}

/** Read everything validation needs, once. `today` is injectable for tests. */
export async function loadValidationContext(
  supabase: SupabaseClient,
  intake: IntakeRow,
  lines: IntakeLineRow[],
  options: { today?: string } = {}
): Promise<ValidationContext> {
  const companyId = intake.company_id;
  // Only a person's explicit choice is carried forward as an id. An automatic
  // match is re-derived every run, so its rule (and any warning) is never lost.
  const customer = await matchCustomer(supabase, companyId, {
    customerId: intake.customer_match_rule === "customer_id" ? intake.customer_id : null,
    customerName: intake.customer_name,
    senderEmail: intake.source === "email" ? intake.customer_reference : null,
  });

  // A person's earlier manual choice is kept (and re-verified inside the company).
  const matches: ProductMatch[] = [];
  for (const line of lines) {
    matches.push(
      await matchProductForLine(supabase, companyId, {
        productId: line.match_rule === "manual" ? line.product_id : null,
        rawSku: line.raw_sku,
        rawDescription: line.raw_description,
      })
    );
  }

  const productIds = [...new Set(matches.map((m) => m.product?.id).filter(Boolean) as string[])];
  const [stock, bom] = await Promise.all([
    loadStock(supabase, companyId, productIds),
    loadBomPresence(supabase, companyId, productIds),
  ]);

  const lineContexts: LineContext[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = matches[index];
    let expectedPrice: LineContext["expectedPrice"] = null;
    let priceError: string | null = null;
    if (match.product) {
      try {
        const price = await resolveCustomerProductPrice(supabase, companyId, {
          customerId: customer.customer?.id ?? null,
          productId: match.product.id,
          asOfDate: intake.order_date || undefined,
        });
        expectedPrice = { sellingPrice: Number(price.sellingPrice || 0), source: price.source, priceListId: price.priceListId };
      } catch (error) {
        priceError = error instanceof Error ? error.message : "Price lookup failed.";
      }
    }
    lineContexts.push({
      line,
      match,
      expectedPrice,
      priceError,
      stock: match.product ? stock.get(match.product.id) || null : null,
      hasBom: match.product && bom ? bom.get(match.product.id) ?? false : null,
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

  return {
    intake,
    customer,
    lines: lineContexts,
    samePoIntakes,
    today: options.today || new Date().toISOString().slice(0, 10),
  };
}

export { loadProductsById, type ProductRecord };
