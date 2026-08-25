import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerCatalogue, type CatalogueProduct } from "@/lib/vyron-order-catalogue";
import { saveCustomerSalesOrder, calculateSalesOrderTotals } from "@/lib/vyron-customer-sales-orders";
import { notifyOrderEvent } from "@/lib/vyron-order-notifications";

/**
 * VYRON ORDER — the customer cart and order submission.
 *
 * The cart holds product and quantity, never a price. Prices are re-resolved
 * from the customer's price list on every read, review and submission, so a
 * cart left open overnight cannot submit at yesterday's price and a browser
 * cannot propose one.
 *
 * Submission hands off to saveCustomerSalesOrder — the existing sales-order
 * engine — which generates the order number, applies the customer price list
 * again on its own side, computes cost and GP internally, and writes to
 * vyron_customer_sales_orders. Nothing here duplicates that.
 *
 * Every function takes a scope resolved from the authenticated session. No
 * function accepts a company or customer identifier from a request.
 */

export type CartScope = { companyId: string; customerId: string; customerName: string };

export type CartLine = {
  productId: string;
  productName: string;
  category: string;
  quantityUnits: number;
  entryMode: "units" | "boxes";
  unitsPerBox: number | null;
  /** Authoritative, re-resolved on every read. */
  sellingPrice: number;
  pricePerBox: number | null;
  lineTotal: number;
  /** Set when the product has gone inactive or lost its price since it was added. */
  unavailable: boolean;
  unavailableReason: string | null;
};

export type CartView = {
  lines: CartLine[];
  itemCount: number;
  unitCount: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  requestedDeliveryDate: string | null;
  notes: string | null;
  hasUnavailable: boolean;
};

export type PriceChange = { productId: string; productName: string; was: number; now: number };

export type SubmitOutcome =
  | { ok: true; orderId: string; orderNumber: string; total: number; requestedDeliveryDate: string | null; duplicate: boolean }
  | { ok: false; reason: "empty" | "unavailable" | "price_changed" | "invalid_date" | "failed"; message: string; priceChanges?: PriceChange[]; unavailable?: string[] };

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------ cart record */

async function getOrCreateCartId(supabase: SupabaseClient, scope: CartScope): Promise<string> {
  const { data: existing } = await supabase
    .from("vyron_customer_order_carts")
    .select("id")
    .eq("company_id", scope.companyId)
    .eq("customer_id", scope.customerId)
    .maybeSingle();
  if (existing?.id) return String(existing.id);

  const { data, error } = await supabase
    .from("vyron_customer_order_carts")
    .insert({ company_id: scope.companyId, customer_id: scope.customerId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return String(data.id);
}

/** Index the customer's catalogue once so cart pricing uses identical rules. */
async function catalogueIndex(supabase: SupabaseClient, scope: CartScope) {
  const catalogue = await getCustomerCatalogue(supabase, scope.companyId, scope.customerId);
  const index = new Map<string, CatalogueProduct>();
  for (const category of catalogue.categories) {
    for (const product of category.products) index.set(product.productId, product);
  }
  return index;
}

export async function getCart(supabase: SupabaseClient, scope: CartScope): Promise<CartView> {
  const cartId = await getOrCreateCartId(supabase, scope);

  const [{ data: cart }, { data: lineRows }] = await Promise.all([
    supabase
      .from("vyron_customer_order_carts")
      .select("requested_delivery_date, notes")
      .eq("id", cartId)
      .maybeSingle(),
    supabase
      .from("vyron_customer_order_cart_lines")
      .select("product_id, quantity_units, entry_mode")
      .eq("cart_id", cartId)
      .eq("company_id", scope.companyId),
  ]);

  const index = await catalogueIndex(supabase, scope);

  const lines: CartLine[] = (lineRows || []).map((row) => {
    const productId = String(row.product_id);
    const product = index.get(productId);
    const quantityUnits = Number(row.quantity_units || 0);
    if (!product) {
      return {
        productId,
        productName: "Unavailable product",
        category: "",
        quantityUnits,
        entryMode: (row.entry_mode as CartLine["entryMode"]) || "units",
        unitsPerBox: null,
        sellingPrice: 0,
        pricePerBox: null,
        lineTotal: 0,
        unavailable: true,
        unavailableReason: "This product is no longer available.",
      };
    }
    const unavailable = product.priceUnavailable;
    return {
      productId,
      productName: product.productName,
      category: product.category,
      quantityUnits,
      entryMode: (row.entry_mode as CartLine["entryMode"]) || "units",
      unitsPerBox: product.unitsPerBox,
      sellingPrice: product.sellingPrice,
      pricePerBox: product.pricePerBox,
      lineTotal: round2(quantityUnits * product.sellingPrice),
      unavailable,
      unavailableReason: unavailable ? "Pricing is currently unavailable for this product." : null,
    };
  });

  lines.sort((a, b) => a.category.localeCompare(b.category) || a.productName.localeCompare(b.productName));

  /*
   * VAT and the payable total come from the sales-order engine's own totals
   * function, applied to exactly the lines submitCart will hand it. Working it
   * out here instead would be a second VAT rule that could drift from the one
   * that actually prices the order — and the customer would see one figure on
   * review and a different one on the confirmation.
   */
  const totals = calculateSalesOrderTotals(
    lines.map((line) => ({
      description: line.productName,
      quantity: line.quantityUnits,
      sellingPrice: line.sellingPrice,
    }))
  );

  return {
    lines,
    itemCount: lines.length,
    unitCount: lines.reduce((s, l) => s + l.quantityUnits, 0),
    subtotal: round2(lines.reduce((s, l) => s + l.lineTotal, 0)),
    vatAmount: totals.vatAmount,
    total: totals.total,
    requestedDeliveryDate: cart?.requested_delivery_date ? String(cart.requested_delivery_date) : null,
    notes: cart?.notes ? String(cart.notes) : null,
    hasUnavailable: lines.some((l) => l.unavailable),
  };
}

/**
 * Set a line to an absolute quantity in units. Zero removes it.
 *
 * The product is validated against the customer's own catalogue, so a product
 * id belonging to another tenant, or one the customer cannot order, is refused
 * rather than silently stored.
 */
export async function setCartLine(
  supabase: SupabaseClient,
  scope: CartScope,
  input: { productId: string; quantityUnits: number; entryMode?: "units" | "boxes" }
): Promise<CartView> {
  const cartId = await getOrCreateCartId(supabase, scope);
  const quantity = Math.max(0, Math.round(Number(input.quantityUnits) || 0));

  if (quantity === 0) {
    await supabase
      .from("vyron_customer_order_cart_lines")
      .delete()
      .eq("cart_id", cartId)
      .eq("company_id", scope.companyId)
      .eq("product_id", input.productId);
    return getCart(supabase, scope);
  }

  const index = await catalogueIndex(supabase, scope);
  const product = index.get(String(input.productId));
  if (!product) throw new Error("That product is not available to order.");

  const entryMode: "units" | "boxes" = input.entryMode === "boxes" && product.unitsPerBox ? "boxes" : "units";

  const { error } = await supabase.from("vyron_customer_order_cart_lines").upsert(
    {
      cart_id: cartId,
      company_id: scope.companyId,
      product_id: product.productId,
      quantity_units: quantity,
      entry_mode: entryMode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cart_id,product_id" }
  );
  if (error) throw new Error(error.message);

  return getCart(supabase, scope);
}

export async function setCartDelivery(
  supabase: SupabaseClient,
  scope: CartScope,
  input: { requestedDeliveryDate?: string | null; notes?: string | null }
): Promise<CartView> {
  const cartId = await getOrCreateCartId(supabase, scope);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.requestedDeliveryDate !== undefined) {
    const date = input.requestedDeliveryDate;
    if (date === null || date === "") patch.requested_delivery_date = null;
    else {
      const check = validateDeliveryDate(date);
      if (!check.ok) throw new Error(check.message);
      patch.requested_delivery_date = check.date;
    }
  }
  if (input.notes !== undefined) {
    patch.notes = input.notes ? String(input.notes).slice(0, 1000) : null;
  }

  const { error } = await supabase.from("vyron_customer_order_carts").update(patch).eq("id", cartId);
  if (error) throw new Error(error.message);
  return getCart(supabase, scope);
}

export async function clearCart(supabase: SupabaseClient, scope: CartScope): Promise<CartView> {
  const cartId = await getOrCreateCartId(supabase, scope);
  await supabase.from("vyron_customer_order_cart_lines").delete().eq("cart_id", cartId);
  await supabase
    .from("vyron_customer_order_carts")
    .update({ requested_delivery_date: null, notes: null, updated_at: new Date().toISOString() })
    .eq("id", cartId);
  return getCart(supabase, scope);
}

/** A delivery date must be a real, near-future calendar date. */
export function validateDeliveryDate(value: string): { ok: true; date: string } | { ok: false; message: string } {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, message: "Choose a delivery date." };
  const parsed = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { ok: false, message: "Choose a delivery date." };
  if (parsed.toISOString().slice(0, 10) !== raw) return { ok: false, message: "Choose a delivery date." };

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  if (raw < todayIso) return { ok: false, message: "Delivery date cannot be in the past." };

  const limit = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (raw > limit) return { ok: false, message: "Delivery date is too far ahead." };
  return { ok: true, date: raw };
}

/* -------------------------------------------------------------- submission */

/**
 * Turn the cart into a real sales order.
 *
 * `acknowledgedPrices` is what the customer was actually shown. Every one is
 * compared against a freshly resolved price and any difference stops the
 * submission, so an order is never placed at a price the customer did not see.
 *
 * `idempotencyKey` is claimed before the order is written. A second tap
 * returns the order already created rather than creating another.
 */
export async function submitCart(
  supabase: SupabaseClient,
  scope: CartScope,
  input: {
    idempotencyKey: string;
    acknowledgedPrices: { productId: string; sellingPrice: number }[];
    /** Origin used to build the staff "View order" link in notifications. */
    baseUrl?: string;
  }
): Promise<SubmitOutcome> {
  const key = String(input.idempotencyKey || "").trim();
  if (!key) return { ok: false, reason: "failed", message: "Your order was not submitted. Please try again." };

  // Replay of an already-completed submission returns the original order.
  const { data: prior } = await supabase
    .from("vyron_customer_order_submissions")
    .select("sales_order_id, order_number")
    .eq("company_id", scope.companyId)
    .eq("customer_id", scope.customerId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (prior?.sales_order_id) {
    const { data: order } = await supabase
      .from("vyron_customer_sales_orders")
      .select("id, order_number, total, requested_delivery_date")
      .eq("id", prior.sales_order_id)
      .maybeSingle();
    return {
      ok: true,
      duplicate: true,
      orderId: String(prior.sales_order_id),
      orderNumber: String(prior.order_number || order?.order_number || ""),
      total: Number(order?.total || 0),
      requestedDeliveryDate: order?.requested_delivery_date ? String(order.requested_delivery_date) : null,
    };
  }

  const cart = await getCart(supabase, scope);
  if (!cart.lines.length) {
    return { ok: false, reason: "empty", message: "Your order is empty." };
  }
  if (cart.hasUnavailable) {
    return {
      ok: false,
      reason: "unavailable",
      message: "Some products are no longer available. Please remove them and try again.",
      unavailable: cart.lines.filter((l) => l.unavailable).map((l) => l.productName),
    };
  }
  if (!cart.requestedDeliveryDate) {
    return { ok: false, reason: "invalid_date", message: "Choose a delivery date." };
  }
  const dateCheck = validateDeliveryDate(cart.requestedDeliveryDate);
  if (!dateCheck.ok) return { ok: false, reason: "invalid_date", message: dateCheck.message };

  const acknowledged = new Map(
    (input.acknowledgedPrices || []).map((p) => [String(p.productId), Number(p.sellingPrice)])
  );
  const priceChanges: PriceChange[] = [];
  for (const line of cart.lines) {
    const shown = acknowledged.get(line.productId);
    if (shown === undefined) {
      priceChanges.push({ productId: line.productId, productName: line.productName, was: 0, now: line.sellingPrice });
      continue;
    }
    if (Math.round(shown * 100) !== Math.round(line.sellingPrice * 100)) {
      priceChanges.push({ productId: line.productId, productName: line.productName, was: shown, now: line.sellingPrice });
    }
  }
  if (priceChanges.length) {
    return {
      ok: false,
      reason: "price_changed",
      message: "Some prices have changed since you added them. Please review your order.",
      priceChanges,
    };
  }

  /*
   * Claim the key BEFORE writing the order. The unique constraint means a
   * concurrent second tap loses the race here and finds the first order rather
   * than creating a duplicate.
   */
  const { error: claimError } = await supabase
    .from("vyron_customer_order_submissions")
    .insert({ idempotency_key: key, company_id: scope.companyId, customer_id: scope.customerId });
  if (claimError) {
    const { data: raced } = await supabase
      .from("vyron_customer_order_submissions")
      .select("sales_order_id, order_number")
      .eq("company_id", scope.companyId)
      .eq("customer_id", scope.customerId)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (raced?.sales_order_id) {
      return {
        ok: true,
        duplicate: true,
        orderId: String(raced.sales_order_id),
        orderNumber: String(raced.order_number || ""),
        total: 0,
        requestedDeliveryDate: cart.requestedDeliveryDate,
      };
    }
    return { ok: false, reason: "failed", message: "Your order was not submitted. Please try again." };
  }

  try {
    // The existing engine owns numbering, price-list application, cost and GP.
    const order = await saveCustomerSalesOrder(supabase, scope.companyId, {
      customerId: scope.customerId,
      customerName: scope.customerName,
      requestedDeliveryDate: dateCheck.date,
      notes: cart.notes || undefined,
      lines: cart.lines.map((line) => ({
        productId: line.productId,
        description: line.productName,
        quantity: line.quantityUnits,
        unit: "each",
        sellingPrice: line.sellingPrice,
      })),
    });

    await supabase
      .from("vyron_customer_order_submissions")
      .update({ sales_order_id: order.id, order_number: order.order_number })
      .eq("company_id", scope.companyId)
      .eq("customer_id", scope.customerId)
      .eq("idempotency_key", key);

    await clearCart(supabase, scope);

    /*
     * The order is committed at this point. Notifications are generated after
     * it, never before and never as a condition of it, so a dead email provider
     * costs a delivery record and not a customer's order. notifyOrderEvent
     * swallows its own failures for the same reason.
     */
    await notifyOrderEvent(
      supabase,
      "new_order",
      {
        companyId: scope.companyId,
        salesOrderId: String(order.id),
        orderNumber: String(order.order_number),
        customerName: scope.customerName,
        total: Number(order.total || 0),
        itemCount: cart.lines.length,
        requestedDeliveryDate: order.requested_delivery_date ? String(order.requested_delivery_date) : dateCheck.date,
        notes: cart.notes,
      },
      { baseUrl: input.baseUrl }
    );

    return {
      ok: true,
      duplicate: false,
      orderId: String(order.id),
      orderNumber: String(order.order_number),
      total: Number(order.total || 0),
      requestedDeliveryDate: order.requested_delivery_date ? String(order.requested_delivery_date) : dateCheck.date,
    };
  } catch {
    // Release the claim so the customer can genuinely retry.
    await supabase
      .from("vyron_customer_order_submissions")
      .delete()
      .eq("company_id", scope.companyId)
      .eq("customer_id", scope.customerId)
      .eq("idempotency_key", key)
      .is("sales_order_id", null);
    return { ok: false, reason: "failed", message: "Your order was not submitted. No order was created." };
  }
}
