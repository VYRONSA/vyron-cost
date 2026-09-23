import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAvailableQuantities } from "@/lib/vyron-sales-order-reservations";
import { assignedListOnly } from "@/lib/vyron-customer-price-lists";

/**
 * VYRON ORDER — the customer-facing catalogue.
 *
 * Every field returned here is safe to send to a customer's phone. Cost, BOM
 * cost, ingredient cost, supplier price, GP and margin are deliberately absent
 * from the row type, so a leak has to be a deliberate change to this file
 * rather than an accidental spread of a wider object.
 *
 * Pricing follows exactly the rules in resolveCustomerProductPrice()
 * (vyron-customer-price-lists.ts): the customer's contract price list wins,
 * then their default price list, then the product master, and a price-list item
 * only counts if it is Active and effective on the date being priced. That
 * function resolves one product at a time; a catalogue needs every product at
 * once, so the same rules are applied here over three batched reads instead of
 * three reads per product. `assertCatalogueMatchesResolver` in the Stage 1
 * security tests proves the two agree product by product.
 */

export type CatalogueProduct = {
  productId: string;
  productName: string;
  category: string;
  sku: string | null;
  /** The customer's own price, VAT exclusive. Safe to expose — they order on it. */
  sellingPrice: number;
  /** "unavailable": this customer's price list does not cover the product. */
  priceSource: "contract" | "default" | "product_master" | "unavailable";
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
  selling_price: number | null;
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

  const { data: productRows, error: productError } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, category, sku, selling_price, status, product_status")
    .eq("company_id", companyId)
    .order("product_name");
  if (productError) throw new Error(productError.message);
  const products = ((productRows || []) as ProductRow[]).filter(isActive);

  // The whole row, so a database without price_source_rule still answers.
  const { data: assignment, error: assignmentError } = await supabase
    .from("vyron_customer_price_list_assignments")
    .select("*")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .eq("status", "Active")
    .maybeSingle();
  if (assignmentError) throw new Error(assignmentError.message);
  // When this customer may only be priced by their own list, a product the
  // list does not cover is shown as unavailable rather than at a price nobody
  // agreed with them.
  const listOnly = assignedListOnly(assignment);

  const contractId = assignment?.contract_price_list_id ? String(assignment.contract_price_list_id) : null;
  const defaultId = assignment?.default_price_list_id ? String(assignment.default_price_list_id) : null;
  const candidateIds = [contractId, defaultId].filter(Boolean) as string[];

  const itemsByProduct = new Map<string, PriceItemRow[]>();
  if (candidateIds.length) {
    const { data: items, error: itemError } = await supabase
      .from("vyron_customer_price_list_items")
      .select("price_list_id, product_id, final_price, effective_from, effective_to")
      .eq("company_id", companyId)
      .eq("status", "Active")
      .in("price_list_id", candidateIds);
    if (itemError) throw new Error(itemError.message);
    for (const item of (items || []) as PriceItemRow[]) {
      const key = String(item.product_id);
      if (!itemsByProduct.has(key)) itemsByProduct.set(key, []);
      itemsByProduct.get(key)!.push(item);
    }
  }

  /** Same selection rule as resolveCustomerProductPrice, contract first. */
  function resolvePrice(product: ProductRow): { price: number; source: CatalogueProduct["priceSource"] } {
    const items = itemsByProduct.get(String(product.id)) || [];
    const effective = items.filter((row) => {
      const startsOk = row.effective_from ? String(row.effective_from) <= asOfDate : true;
      const endsOk = row.effective_to ? String(row.effective_to) >= asOfDate : true;
      return startsOk && endsOk;
    });
    const contract = contractId ? effective.find((r) => String(r.price_list_id) === contractId) : undefined;
    if (contract) return { price: num(contract.final_price), source: "contract" };
    const fallback = defaultId ? effective.find((r) => String(r.price_list_id) === defaultId) : undefined;
    if (fallback) return { price: num(fallback.final_price), source: "default" };
    if (listOnly) return { price: 0, source: "unavailable" };
    return { price: num(product.selling_price), source: "product_master" };
  }

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
    const { price, source } = resolvePrice(product);
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
