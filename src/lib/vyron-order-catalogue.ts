import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAvailableQuantities } from "@/lib/vyron-sales-order-reservations";
import { expireStaleCustomerHolds } from "@/lib/vyron-order-holds";

/**
 * VYRON ORDER — the customer-facing catalogue.
 *
 * Every field returned here is safe to send to a customer's phone. Cost, BOM
 * cost, ingredient cost, supplier price, GP and margin are deliberately absent
 * from the row type, so a leak has to be a deliberate change to this file
 * rather than an accidental spread of a wider object.
 *
 * WHAT A CUSTOMER MAY SEE AND ORDER IS THEIR PRICE LIST, NOTHING ELSE.
 * A product is in a customer's catalogue only when an Active, currently
 * effective item for it sits on the Active contract or default price list of
 * the customer's Active assignment (loadCustomerPermittedPrices). A product in
 * stock, or in the product master, is not thereby orderable by every customer.
 * Until 2026-09-28 the catalogue listed every active product in the tenant and
 * priced the ones off the customer's list from the product master, so any
 * customer could see and order any stock item.
 *
 * Among permitted products the price follows resolveCustomerProductPrice()
 * (vyron-customer-price-lists.ts): contract beats default, and within a list
 * the most recently effective item wins. The customer app never falls back to
 * the product master; that fallback remains a staff sales-order setting.
 */

export type CatalogueProduct = {
  productId: string;
  productName: string;
  category: string;
  sku: string | null;
  /** The customer's own price, VAT exclusive. Safe to expose — they order on it. */
  sellingPrice: number;
  /** Which of the customer's lists priced it. Off-list products are never in the catalogue. */
  priceSource: "contract" | "default";
  /** True when no price could be established; such products cannot be ordered. */
  priceUnavailable: boolean;
  /**
   * Units per selling box, from vyron_cost_product_pack_sizes.
   *
   * Null means no verified pack size exists, and the product is ordered in
   * units. That is a valid permanent state — a conversion is never inferred
   * from a product name or weight.
   */
  unitsPerBox: number | null;
  /** Price for one box. Null whenever unitsPerBox is null. */
  pricePerBox: number | null;
  /**
   * How many the customer may order right now: stock on hand less what other
   * live sales orders already hold, from the one availability calculation
   * (loadAvailableQuantities). Null means the product has no stock record, so
   * availability is not measured and is not guessed either.
   *
   * On hand is NOT sent to a customer: how much is in the building is the
   * business's information. What they may order is theirs.
   */
  availableQty: number | null;
  availability: "available" | "limited" | "out_of_stock" | "not_measured";
  /** True when nothing can be ordered: no price, or none available. */
  unavailable: boolean;
};

export type CatalogueCategory = {
  category: string;
  productCount: number;
  products: CatalogueProduct[];
};

export type CustomerCatalogue = {
  customerId: string;
  customerName: string;
  asOfDate: string;
  categories: CatalogueCategory[];
  productCount: number;
  unpricedCount: number;
  /** Products with no verified pack size — ordered in units. */
  withoutPackSize: number;
  /** Products that cannot be ordered right now because none is available. */
  outOfStockCount: number;
  /** Products with no stock record: availability is unknown, not zero. */
  notMeasuredCount: number;
};

type ProductRow = {
  id: string;
  product_name: string;
  category: string | null;
  sku: string | null;
  status: string | null;
  product_status: string | null;
};

type PriceItemRow = {
  price_list_id: string;
  product_id: string;
  final_price: number | null;
  effective_from: string | null;
  effective_to: string | null;
};

export type PermittedProductPrice = {
  productId: string;
  priceListId: string;
  source: "contract" | "default";
  price: number;
};

const inWindow = (from: unknown, to: unknown, asOfDate: string) =>
  (from ? String(from) <= asOfDate : true) && (to ? String(to) >= asOfDate : true);

/**
 * The products this customer may order, and the price each is sold at.
 *
 * Everything is derived from the company and customer of the authenticated
 * session. A product is permitted only through:
 *   the customer's Active price-list assignment
 *   -> its contract or default price list, which must itself be Active and in date
 *   -> an Active item for the product on that list, effective on `asOfDate`.
 * No assignment, no list, no item: no product. Nothing falls back to the
 * product master here.
 *
 * Used by the catalogue (what is shown) and again, independently, by order
 * submission immediately before the order is written.
 */
export async function loadCustomerPermittedPrices(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string,
  asOfDate: string = new Date().toISOString().slice(0, 10)
): Promise<Map<string, PermittedProductPrice>> {
  const permitted = new Map<string, PermittedProductPrice>();

  const { data: assignment, error: assignmentError } = await supabase
    .from("vyron_customer_price_list_assignments")
    .select("contract_price_list_id, default_price_list_id")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .eq("status", "Active")
    .maybeSingle();
  if (assignmentError) throw new Error(assignmentError.message);
  const contractId = assignment?.contract_price_list_id ? String(assignment.contract_price_list_id) : null;
  const defaultId = assignment?.default_price_list_id ? String(assignment.default_price_list_id) : null;
  const assignedIds = [contractId, defaultId].filter(Boolean) as string[];
  if (!assignedIds.length) return permitted;

  // The lists themselves must be live. A list that is switched off or has
  // ended grants nothing, whatever items remain on it.
  const { data: lists, error: listError } = await supabase
    .from("vyron_customer_price_lists")
    .select("id, status, effective_from, effective_to")
    .eq("company_id", companyId)
    .in("id", assignedIds);
  if (listError) throw new Error(listError.message);
  const liveIds = new Set(
    (lists || [])
      .filter((l) => String(l.status || "").toLowerCase() === "active" && inWindow(l.effective_from, l.effective_to, asOfDate))
      .map((l) => String(l.id))
  );
  const candidateIds = assignedIds.filter((id) => liveIds.has(id));
  if (!candidateIds.length) return permitted;

  const { data: items, error: itemError } = await supabase
    .from("vyron_customer_price_list_items")
    .select("price_list_id, product_id, final_price, effective_from, effective_to")
    .eq("company_id", companyId)
    .eq("status", "Active")
    .in("price_list_id", candidateIds);
  if (itemError) throw new Error(itemError.message);

  // Same selection as resolveCustomerProductPrice: contract first, then the
  // most recently effective item.
  const effective = ((items || []) as PriceItemRow[])
    .filter((row) => row.product_id && inWindow(row.effective_from, row.effective_to, asOfDate))
    .sort((a, b) => {
      const contractRank = Number(b.price_list_id === contractId) - Number(a.price_list_id === contractId);
      if (contractRank !== 0) return contractRank;
      return String(b.effective_from || "").localeCompare(String(a.effective_from || ""));
    });
  for (const row of effective) {
    const productId = String(row.product_id);
    if (permitted.has(productId)) continue;
    permitted.set(productId, {
      productId,
      priceListId: String(row.price_list_id),
      source: String(row.price_list_id) === contractId ? "contract" : "default",
      price: num(row.final_price),
    });
  }
  return permitted;
}

/** Below this many boxes (or units where there is no box) the customer is warned. */
const LIMITED_BOXES = 2;

const num = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

function isActive(row: ProductRow) {
  const a = String(row.status || "").toLowerCase();
  const b = String(row.product_status || "").toLowerCase();
  // Treat a blank status as active; only an explicit inactive/archived hides it.
  const blocked = ["inactive", "archived", "discontinued", "disabled"];
  return !blocked.includes(a) && !blocked.includes(b);
}

/**
 * Build the catalogue a specific customer is allowed to see.
 *
 * `companyId` and `customerId` must come from the authenticated session, never
 * from the request body or query string.
 */
export async function getCustomerCatalogue(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string,
  options: { asOfDate?: string } = {}
): Promise<CustomerCatalogue> {
  const asOfDate = options.asOfDate || new Date().toISOString().slice(0, 10);

  // The customer must belong to this company. This is the tenant gate: a
  // customer id from another tenant simply resolves to nothing.
  const { data: customer, error: customerError } = await supabase
    .from("vyron_customers")
    .select("id, customer_name")
    .eq("company_id", companyId)
    .eq("id", customerId)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!customer) throw new Error("Customer not found in this company.");

  const { data: packRows, error: packError } = await supabase
    .from("vyron_cost_product_pack_sizes")
    .select("product_id, units_per_box")
    .eq("company_id", companyId);
  if (packError) throw new Error(packError.message);
  const unitsPerBoxByProduct = new Map<string, number>();
  for (const row of packRows || []) {
    const units = Number(row.units_per_box);
    if (Number.isFinite(units) && units > 0) unitsPerBoxByProduct.set(String(row.product_id), units);
  }

  // Only the products this customer's price list permits. Nothing else in the
  // tenant, however much of it is in stock, is read, shown or priced.
  const permitted = await loadCustomerPermittedPrices(supabase, companyId, customerId, asOfDate);
  let products: ProductRow[] = [];
  if (permitted.size) {
    const { data: productRows, error: productError } = await supabase
      .from("vyron_cost_products")
      .select("id, product_name, category, sku, status, product_status")
      .eq("company_id", companyId)
      .in("id", [...permitted.keys()])
      .order("product_name");
    if (productError) throw new Error(productError.message);
    products = ((productRows || []) as ProductRow[]).filter((p) => isActive(p) && permitted.has(String(p.id)));
  }

  /*
   * Orders nobody decided on in time give their stock back before availability
   * is worked out, so what the customer sees already reflects the release.
   * Does nothing until a company has set a hold policy.
   */
  await expireStaleCustomerHolds(supabase, companyId);

  /*
   * What may still be sold, from the one availability calculation the staff
   * sales-order approval also enforces. Nothing about stock is worked out
   * here: a second rule would be a second answer, and the customer would be
   * told one thing while approval did another.
   */
  const availability = await loadAvailableQuantities(
    supabase,
    companyId,
    products.map((p) => String(p.id))
  );

  const rows: CatalogueProduct[] = products.map((product) => {
    const { price, source } = permitted.get(String(product.id))!;
    const unitsPerBox = unitsPerBoxByProduct.get(String(product.id)) ?? null;
    const stock = availability.get(String(product.id));
    const availableQty = stock?.measured ? stock.available : null;
    const priceUnavailable = price <= 0;
    const state: CatalogueProduct["availability"] = !stock?.measured
      ? "not_measured"
      : stock.available <= 0
        ? "out_of_stock"
        : stock.available <= (unitsPerBox || 1) * LIMITED_BOXES
          ? "limited"
          : "available";
    return {
      productId: String(product.id),
      productName: String(product.product_name || "—"),
      category: String(product.category || "Other"),
      sku: product.sku ? String(product.sku) : null,
      sellingPrice: price,
      priceSource: source,
      priceUnavailable,
      unitsPerBox,
      // The box price is derived from the unit price so the two can never drift.
      pricePerBox: unitsPerBox && price > 0 ? Math.round(price * unitsPerBox * 100) / 100 : null,
      availableQty,
      availability: state,
      unavailable: priceUnavailable || state === "out_of_stock",
    };
  });

  const byCategory = new Map<string, CatalogueProduct[]>();
  for (const row of rows) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  }

  const categories: CatalogueCategory[] = [...byCategory.entries()]
    .map(([category, list]) => ({
      category,
      productCount: list.length,
      products: list.sort((a, b) => a.productName.localeCompare(b.productName)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return {
    customerId: String(customer.id),
    customerName: String(customer.customer_name || "Customer"),
    asOfDate,
    categories,
    productCount: rows.length,
    unpricedCount: rows.filter((r) => r.priceUnavailable).length,
    withoutPackSize: rows.filter((r) => r.unitsPerBox === null).length,
    outOfStockCount: rows.filter((r) => r.availability === "out_of_stock").length,
    notMeasuredCount: rows.filter((r) => r.availability === "not_measured").length,
  };
}
