import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerCatalogue, type CatalogueProduct } from "@/lib/vyron-order-catalogue";
import { setCartLine, getCart, type CartScope, type CartView } from "@/lib/vyron-order-cart";

/**
 * VYRON ORDER — a customer's own order history, reorder and favourites.
 *
 * Every read is filtered on the company AND the customer from the session, so
 * an order id belonging to someone else simply does not resolve. Nothing here
 * returns cost, GP, margin, stock, procurement or internal notes: the customer
 * sees what they ordered, what it cost them, and where it is.
 */

/**
 * Customer-facing status wording.
 *
 * The internal SALES_ORDER_STATUSES machine remains the single source of truth;
 * this only renames its states for a customer who does not need to know what
 * "Picking" means internally. Unknown states fall back to the raw value rather
 * than being hidden.
 */
const CUSTOMER_STATUS: Record<string, string> = {
  Draft: "Received",
  "Awaiting Approval": "Received",
  Approved: "Confirmed",
  Picking: "Being prepared",
  Packed: "Ready",
  Dispatched: "On the way",
  "Partially Invoiced": "Delivered",
  Invoiced: "Completed",
  Cancelled: "Cancelled",
};

export function customerFacingStatus(status: string) {
  return CUSTOMER_STATUS[status] || status;
}

export type CustomerOrderSummary = {
  orderId: string;
  orderNumber: string;
  orderDate: string | null;
  requestedDeliveryDate: string | null;
  total: number;
  status: string;
  customerStatus: string;
  lineCount: number;
};

export type CustomerOrderLine = {
  productId: string | null;
  description: string;
  quantity: number;
  unit: string;
  sellingPrice: number;
  lineTotal: number;
};

export type CustomerOrderDetail = CustomerOrderSummary & {
  notes: string | null;
  lines: CustomerOrderLine[];
};

export async function listCustomerOrders(
  supabase: SupabaseClient,
  scope: CartScope,
  limit = 25
): Promise<CustomerOrderSummary[]> {
  const { data, error } = await supabase
    .from("vyron_customer_sales_orders")
    .select("id, order_number, created_at, requested_delivery_date, total, status")
    .eq("company_id", scope.companyId)
    .eq("customer_id", scope.customerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const orders = data || [];
  if (!orders.length) return [];

  const { data: lineCounts } = await supabase
    .from("vyron_customer_sales_order_lines")
    .select("sales_order_id")
    .eq("company_id", scope.companyId)
    .in("sales_order_id", orders.map((o) => o.id));
  const counts = new Map<string, number>();
  for (const row of lineCounts || []) {
    const key = String(row.sales_order_id);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return orders.map((o) => ({
    orderId: String(o.id),
    orderNumber: String(o.order_number || ""),
    orderDate: o.created_at ? String(o.created_at).slice(0, 10) : null,
    requestedDeliveryDate: o.requested_delivery_date ? String(o.requested_delivery_date) : null,
    total: Number(o.total || 0),
    status: String(o.status || ""),
    customerStatus: customerFacingStatus(String(o.status || "")),
    lineCount: counts.get(String(o.id)) || 0,
  }));
}

export async function getCustomerOrder(
  supabase: SupabaseClient,
  scope: CartScope,
  orderId: string
): Promise<CustomerOrderDetail | null> {
  // Scoped by company AND customer: another customer's order id resolves to null.
  const { data: order } = await supabase
    .from("vyron_customer_sales_orders")
    .select("id, order_number, created_at, requested_delivery_date, total, status, notes")
    .eq("company_id", scope.companyId)
    .eq("customer_id", scope.customerId)
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;

  const { data: lineRows } = await supabase
    .from("vyron_customer_sales_order_lines")
    .select("product_id, description, quantity, unit, selling_price, line_total")
    .eq("company_id", scope.companyId)
    .eq("sales_order_id", order.id)
    .order("sort_order");

  return {
    orderId: String(order.id),
    orderNumber: String(order.order_number || ""),
    orderDate: order.created_at ? String(order.created_at).slice(0, 10) : null,
    requestedDeliveryDate: order.requested_delivery_date ? String(order.requested_delivery_date) : null,
    total: Number(order.total || 0),
    status: String(order.status || ""),
    customerStatus: customerFacingStatus(String(order.status || "")),
    lineCount: (lineRows || []).length,
    notes: order.notes ? String(order.notes) : null,
    // selling_price and line_total only — cost_per_unit is never selected.
    lines: (lineRows || []).map((l) => ({
      productId: l.product_id ? String(l.product_id) : null,
      description: String(l.description || ""),
      quantity: Number(l.quantity || 0),
      unit: String(l.unit || "each"),
      sellingPrice: Number(l.selling_price || 0),
      lineTotal: Number(l.line_total || 0),
    })),
  };
}

export type ReorderOutcome = {
  cart: CartView;
  added: number;
  skipped: { description: string; reason: string }[];
  priceChanges: { productName: string; was: number; now: number }[];
};

/**
 * Load a previous order into the cart.
 *
 * Never a blind clone: each line is re-checked against the customer's current
 * catalogue, dropped if the product has gone or lost its price, and any price
 * that has moved since the original order is reported so the customer sees it
 * before submitting.
 */
export async function reorderIntoCart(
  supabase: SupabaseClient,
  scope: CartScope,
  orderId: string
): Promise<ReorderOutcome | null> {
  const order = await getCustomerOrder(supabase, scope, orderId);
  if (!order) return null;

  const catalogue = await getCustomerCatalogue(supabase, scope.companyId, scope.customerId);
  const index = new Map<string, CatalogueProduct>();
  for (const category of catalogue.categories) {
    for (const product of category.products) index.set(product.productId, product);
  }

  const skipped: ReorderOutcome["skipped"] = [];
  const priceChanges: ReorderOutcome["priceChanges"] = [];
  let added = 0;

  for (const line of order.lines) {
    if (!line.productId) {
      skipped.push({ description: line.description, reason: "No longer available" });
      continue;
    }
    const product = index.get(line.productId);
    if (!product) {
      skipped.push({ description: line.description, reason: "No longer available" });
      continue;
    }
    if (product.priceUnavailable) {
      skipped.push({ description: product.productName, reason: "Pricing unavailable" });
      continue;
    }
    const quantity = Math.max(0, Math.round(line.quantity));
    if (!quantity) {
      skipped.push({ description: product.productName, reason: "Invalid quantity" });
      continue;
    }
    if (Math.round(line.sellingPrice * 100) !== Math.round(product.sellingPrice * 100)) {
      priceChanges.push({ productName: product.productName, was: line.sellingPrice, now: product.sellingPrice });
    }
    await setCartLine(supabase, scope, {
      productId: product.productId,
      quantityUnits: quantity,
      entryMode: product.unitsPerBox && quantity % product.unitsPerBox === 0 ? "boxes" : "units",
    });
    added += 1;
  }

  return { cart: await getCart(supabase, scope), added, skipped, priceChanges };
}

/* ------------------------------------------------------------- favourites */

export async function listFavourites(supabase: SupabaseClient, scope: CartScope): Promise<string[]> {
  const { data, error } = await supabase
    .from("vyron_customer_order_favourites")
    .select("product_id")
    .eq("company_id", scope.companyId)
    .eq("customer_id", scope.customerId);
  if (error) throw new Error(error.message);
  return (data || []).map((r) => String(r.product_id));
}

/** Toggling validates the product against the customer's own catalogue first. */
export async function toggleFavourite(
  supabase: SupabaseClient,
  scope: CartScope,
  productId: string
): Promise<{ favourite: boolean }> {
  const catalogue = await getCustomerCatalogue(supabase, scope.companyId, scope.customerId);
  const known = catalogue.categories.some((c) => c.products.some((p) => p.productId === productId));
  if (!known) throw new Error("That product is not available to order.");

  const { data: existing } = await supabase
    .from("vyron_customer_order_favourites")
    .select("id")
    .eq("company_id", scope.companyId)
    .eq("customer_id", scope.customerId)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("vyron_customer_order_favourites").delete().eq("id", existing.id);
    return { favourite: false };
  }
  const { error } = await supabase.from("vyron_customer_order_favourites").insert({
    company_id: scope.companyId,
    customer_id: scope.customerId,
    product_id: productId,
  });
  if (error) throw new Error(error.message);
  return { favourite: true };
}

/* ---------------------------------------------------------- your usuals */

export type UsualProduct = { productId: string; productName: string; timesOrdered: number; typicalUnits: number };

/**
 * Products this customer orders regularly, from their own sales-order history.
 *
 * Returns nothing unless there is enough history to be trustworthy: at least
 * three orders overall, and a product must appear in at least two of them.
 * A single past order is not a habit, and guessing at one would be worse than
 * showing nothing.
 */
export async function getUsualProducts(
  supabase: SupabaseClient,
  scope: CartScope,
  limit = 8
): Promise<UsualProduct[]> {
  const { data: orders } = await supabase
    .from("vyron_customer_sales_orders")
    .select("id")
    .eq("company_id", scope.companyId)
    .eq("customer_id", scope.customerId)
    .neq("status", "Cancelled")
    .order("created_at", { ascending: false })
    .limit(20);

  const orderIds = (orders || []).map((o) => String(o.id));
  if (orderIds.length < 3) return [];

  const { data: lines } = await supabase
    .from("vyron_customer_sales_order_lines")
    .select("sales_order_id, product_id, description, quantity")
    .eq("company_id", scope.companyId)
    .in("sales_order_id", orderIds);

  const byProduct = new Map<string, { name: string; orders: Set<string>; quantities: number[] }>();
  for (const line of lines || []) {
    if (!line.product_id) continue;
    const key = String(line.product_id);
    if (!byProduct.has(key)) byProduct.set(key, { name: String(line.description || ""), orders: new Set(), quantities: [] });
    const entry = byProduct.get(key)!;
    entry.orders.add(String(line.sales_order_id));
    entry.quantities.push(Number(line.quantity || 0));
  }

  const usuals: UsualProduct[] = [];
  for (const [productId, entry] of byProduct) {
    if (entry.orders.size < 2) continue;
    const sorted = [...entry.quantities].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    usuals.push({
      productId,
      productName: entry.name,
      timesOrdered: entry.orders.size,
      typicalUnits: Math.round(median),
    });
  }

  return usuals.sort((a, b) => b.timesOrdered - a.timesOrdered).slice(0, limit);
}
