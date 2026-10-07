/**
 * VOLORA — what a customer is priced from, for the Customer Price Management screen.
 *
 * Pure and browser-safe: it reads the price lists, assignments and list items the existing
 * /api/customer-price-lists endpoints already return and answers "which list prices this customer,
 * and at what price is each product sold to them today" by the SAME rules as
 * resolveCustomerProductPrice (src/lib/vyron-customer-price-lists.ts). It decides nothing new:
 *
 *   1. An Active assignment's lists (contract, then standard) govern the customer.
 *   2. With no Active assignment (or one without lists), the company default list governs.
 *   3. With neither, the legacy product-master price applies.
 *   A list counts only while it is Active and in date; an item only while Active and in date; for a
 *   product priced on both, the contract price wins, then the most recently effective price.
 *
 * Shared lists stay shared: editing a price here edits the list item, which every customer on that
 * list (or, for the company default, every customer without a list) is priced from.
 */

export type PricingList = {
  id: string;
  list_name: string;
  list_type: "Standard" | "Contract";
  status: "Active" | "Inactive";
  version?: number;
  effective_from?: string | null;
  effective_to?: string | null;
  is_company_default?: boolean | null;
};

export type PricingAssignment = {
  id?: string;
  customer_id: string;
  default_price_list_id: string | null;
  contract_price_list_id: string | null;
  status: "Active" | "Inactive" | string;
};

export type PricingItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  finalPrice: number;
  status: "Active" | "Inactive";
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type PricingSource = "assigned" | "company_default" | "product_master";

export type CustomerPricingSummary = {
  source: PricingSource;
  /** The Active assignment, if the customer has one with at least one list. */
  assignment: PricingAssignment | null;
  /** An assignment row exists but is Inactive (so it does not price the customer). */
  assignmentInactive: boolean;
  standardList: PricingList | null;
  contractList: PricingList | null;
  companyDefault: PricingList | null;
  /** The lists that price this customer, contract first. */
  governingLists: PricingList[];
  /** Plain-language problems, e.g. an assigned list that is inactive or out of date. */
  warnings: string[];
};

export type ItemState = "Active" | "Scheduled" | "Expired" | "Removed" | "List not in use";

export type CustomerPriceRow = {
  productId: string;
  productName: string;
  sku: string | null;
  price: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  state: ItemState;
  /** The list and item this price comes from (and that an edit changes). */
  listId: string;
  listName: string;
  itemId: string;
  /** Another governing list prices the product too, but this one wins. */
  overrides: { listName: string; price: number } | null;
};

/** Why a list does not price anyone today, or null when it does. */
export function listProblem(list: PricingList | null | undefined, today: string): string | null {
  if (!list) return null;
  if (String(list.status || "Active") !== "Active") return `${list.list_name} is inactive`;
  if (list.effective_from && String(list.effective_from) > today) return `${list.list_name} only takes effect on ${list.effective_from}`;
  if (list.effective_to && String(list.effective_to) < today) return `${list.list_name} expired on ${list.effective_to}`;
  return null;
}

export function itemState(item: PricingItem, today: string): Exclude<ItemState, "List not in use"> {
  if (item.status !== "Active") return "Removed";
  if (item.effectiveFrom && item.effectiveFrom > today) return "Scheduled";
  if (item.effectiveTo && item.effectiveTo < today) return "Expired";
  return "Active";
}

export function customerPricingSummary(input: { customerId: string; assignments: PricingAssignment[]; lists: PricingList[]; today: string }): CustomerPricingSummary {
  const listById = new Map(input.lists.map((l) => [l.id, l]));
  const row = input.assignments.find((a) => a.customer_id === input.customerId) || null;
  const active = row && String(row.status || "Active") === "Active" ? row : null;
  const contractList = active?.contract_price_list_id ? listById.get(active.contract_price_list_id) || null : null;
  const standardList = active?.default_price_list_id ? listById.get(active.default_price_list_id) || null : null;
  const companyDefaults = input.lists.filter((l) => l.is_company_default);
  const companyDefault = companyDefaults.length === 1 ? companyDefaults[0] : null;
  const warnings: string[] = [];
  if (companyDefaults.length > 1) warnings.push(`More than one company default list is set (${companyDefaults.map((l) => l.list_name).join(", ")}).`);

  const hasAssignedList = Boolean(active && (active.contract_price_list_id || active.default_price_list_id));
  let source: PricingSource;
  let governingLists: PricingList[];
  if (hasAssignedList) {
    source = "assigned";
    governingLists = [contractList, standardList].filter((l): l is PricingList => Boolean(l));
    for (const id of [active!.contract_price_list_id, active!.default_price_list_id]) if (id && !listById.has(id)) warnings.push("An assigned price list no longer exists; it prices nothing for this customer.");
    for (const l of governingLists) {
      const problem = listProblem(l, input.today);
      if (problem) warnings.push(`${problem}, so it prices nothing for this customer today.`);
    }
  } else if (companyDefault) {
    source = "company_default";
    governingLists = [companyDefault];
    const problem = listProblem(companyDefault, input.today);
    if (problem) warnings.push(`${problem}, so customers without a list get no list prices today.`);
  } else {
    source = "product_master";
    governingLists = [];
  }
  return {
    source,
    assignment: hasAssignedList ? active : null,
    assignmentInactive: Boolean(row && !active),
    standardList,
    contractList,
    companyDefault,
    governingLists,
    warnings,
  };
}

/**
 * One row per product across the governing lists: the price the customer is charged today, from the
 * list that wins under the resolver's rules. A product with no price in force today is still listed
 * (scheduled, expired, removed, or on a list not in use) so nothing is hidden.
 */
export function customerPriceRows(input: { lists: Array<{ list: PricingList; items: PricingItem[] }>; contractListId: string | null; today: string }): CustomerPriceRow[] {
  type Candidate = { list: PricingList; item: PricingItem; state: ItemState; inForce: boolean };
  const byProduct = new Map<string, Candidate[]>();
  for (const { list, items } of input.lists) {
    const listUsable = listProblem(list, input.today) === null;
    for (const item of items) {
      const own = itemState(item, input.today);
      const state: ItemState = own === "Active" && !listUsable ? "List not in use" : own;
      const candidates = byProduct.get(item.productId) || [];
      candidates.push({ list, item, state, inForce: state === "Active" });
      byProduct.set(item.productId, candidates);
    }
  }
  const rank = (c: Candidate) => (c.list.id === input.contractListId ? 1 : 0);
  const rows: CustomerPriceRow[] = [];
  for (const candidates of byProduct.values()) {
    candidates.sort((a, b) => Number(b.inForce) - Number(a.inForce) || rank(b) - rank(a) || String(b.item.effectiveFrom || "").localeCompare(String(a.item.effectiveFrom || "")));
    const winner = candidates[0];
    const runnerUp = candidates.find((c) => c !== winner && c.inForce && c.list.id !== winner.list.id);
    rows.push({
      productId: winner.item.productId,
      productName: winner.item.productName,
      sku: winner.item.sku,
      price: winner.item.finalPrice,
      effectiveFrom: winner.item.effectiveFrom,
      effectiveTo: winner.item.effectiveTo,
      state: winner.state,
      listId: winner.list.id,
      listName: winner.list.list_name,
      itemId: winner.item.id,
      overrides: winner.inForce && runnerUp ? { listName: runnerUp.list.list_name, price: runnerUp.item.finalPrice } : null,
    });
  }
  const order: Record<ItemState, number> = { Active: 0, Scheduled: 1, "List not in use": 2, Expired: 3, Removed: 4 };
  return rows.sort((a, b) => order[a.state] - order[b.state] || a.productName.localeCompare(b.productName));
}

/**
 * The body for POST /api/customer-price-lists { mode: "assign" }. The endpoint writes both slots, so
 * the slot not being changed is carried over from the current assignment — changing the standard list
 * never clears a contract list, and the reverse. `null` for both removes the customer's lists (they
 * are then priced from the company default).
 */
export function assignmentRequest(input: {
  customerId: string;
  current: PricingAssignment | null;
  standardListId?: string | null;
  contractListId?: string | null;
}): { mode: "assign"; customerId: string; defaultPriceListId: string | null; contractPriceListId: string | null; status: "Active" } {
  const currentActive = input.current && String(input.current.status || "Active") === "Active" ? input.current : null;
  return {
    mode: "assign",
    customerId: input.customerId,
    defaultPriceListId: input.standardListId !== undefined ? input.standardListId || null : currentActive?.default_price_list_id || null,
    contractPriceListId: input.contractListId !== undefined ? input.contractListId || null : currentActive?.contract_price_list_id || null,
    status: "Active",
  };
}

/** Customers matching a search (name, code, trading name), best matches first. */
export function searchCustomers<T extends { customer_name: string; customer_code?: string | null; trading_name?: string | null }>(customers: T[], query: string, limit = 50): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return customers.slice(0, limit);
  const scored: Array<{ c: T; score: number }> = [];
  for (const c of customers) {
    const name = String(c.customer_name || "").toLowerCase();
    const code = String(c.customer_code || "").toLowerCase();
    const trading = String(c.trading_name || "").toLowerCase();
    const score = name.startsWith(q) || code === q ? 0 : name.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : name.includes(q) || code.includes(q) || trading.includes(q) ? 2 : -1;
    if (score >= 0) scored.push({ c, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.c.customer_name.localeCompare(b.c.customer_name)).slice(0, limit).map((s) => s.c);
}

export function customerIsActive(c: { active?: boolean | null; status?: string | null }): boolean {
  if (c.active === false) return false;
  return !/^(inactive|archived|disabled|closed)$/i.test(String(c.status || "").trim());
}
