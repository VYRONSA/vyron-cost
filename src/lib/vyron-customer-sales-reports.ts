import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCustomerPermittedPrices } from "@/lib/vyron-order-catalogue";
import { PriceListError, isUuidShape } from "@/lib/vyron-customer-price-lists";

/**
 * VOLORA — Customer Price List report and Sales by Customer / Item / Date.
 *
 * Both take companyId from the verified session (the API route resolves it)
 * and read only that company's rows. Any customer, price-list or product id a
 * person filters by is re-checked against the company first: another tenant's
 * id is refused exactly like one that does not exist (404), as in the price-list
 * editor, so a filter can never reach or confirm another tenant's data.
 *
 * PRICE LIST REPORT answers "what price is this customer entitled to today for
 * each product?" from the authoritative assignments, lists, items and products.
 * The entitled price is decided by loadCustomerPermittedPrices() — the one rule
 * the Customer Order catalogue and order submission already enforce — so this
 * report cannot disagree with what the customer is actually offered.
 *
 * SALES REPORT reads recorded transactions only: customer invoices (the
 * established source of recorded sales, as the GP report uses) or customer
 * sales orders. Every price and value comes from the line as it was recorded.
 * Price lists are never read, so changing, removing or restoring a price-list
 * item cannot change a historical sale.
 */

const PAGE = 1000;
const IN_CHUNK = 150;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const text = (v: unknown) => String(v ?? "").trim();
const today = () => new Date().toISOString().slice(0, 10);

/** PostgREST caps a response (1000 rows by default); read every page. */
async function readAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/** `.in()` with thousands of ids overflows a URL; read in chunks. */
async function readIn<T>(ids: string[], build: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await build(ids.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as T[]));
  }
  return rows;
}

function readDate(value: unknown, label: string): string | null {
  const v = text(value);
  if (!v) return null;
  if (!DATE.test(v) || Number.isNaN(Date.parse(v))) throw new PriceListError(`${label} must be a date (YYYY-MM-DD).`);
  return v;
}

function productIsActive(row: { status?: unknown; product_status?: unknown }) {
  const blocked = ["inactive", "archived", "discontinued", "disabled"];
  return !blocked.includes(text(row.status).toLowerCase()) && !blocked.includes(text(row.product_status).toLowerCase());
}

/** Refuse an id that is not this company's, exactly like a missing one. */
async function requireOwned(supabase: SupabaseClient, companyId: string, table: string, id: string | null, label: string) {
  if (!id) return;
  // A malformed id names nothing; refusing it here keeps a database cast error from becoming a 500.
  if (!isUuidShape(id)) throw new PriceListError(`${label} not found.`, 404);
  const { data, error } = await supabase.from(table).select("id").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new PriceListError(`${label} not found.`, 404);
}

/** Customer rows for the company; customer_code only where the column exists. */
async function loadCustomers(supabase: SupabaseClient, companyId: string) {
  const rows = await readAll<Record<string, unknown>>((f, t) =>
    supabase.from("vyron_customers").select("*").eq("company_id", companyId).order("customer_name").range(f, t)
  );
  return new Map(
    rows.map((r) => [
      text(r.id),
      { name: text(r.customer_name) || "Customer", code: text(r.customer_code) || null, status: text(r.status) || (r.active === false ? "Inactive" : "Active") },
    ])
  );
}

/* ================================================================ PRICE LIST */

export type PriceListReportStatus = "entitled" | "active" | "inactive" | "all";

export type PriceListReportFilters = {
  customerId?: string | null;
  priceListId?: string | null;
  productId?: string | null;
  search?: string | null;
  status?: string | null;
  /** The day entitlement is judged on. Defaults to today. */
  asOf?: string | null;
  /** Keep rows whose effective window overlaps this range. */
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

export type PriceListReportRow = {
  customerId: string;
  customerName: string;
  customerCode: string | null;
  priceListId: string;
  priceListName: string;
  listType: string;
  role: "Contract" | "Default";
  version: number;
  listStatus: string;
  assignmentStatus: string;
  productId: string;
  productName: string;
  sku: string | null;
  listPrice: number;
  itemStatus: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  /** True for the one row per customer and product the customer is charged today. */
  entitled: boolean;
  /** Why a row is not the customer's price, when it is not. */
  note: string | null;
};

export type ReportOption = { id: string; name: string };

export type PriceListReport = {
  asOf: string;
  status: PriceListReportStatus;
  rows: PriceListReportRow[];
  /** Filter choices, all from this company: never another tenant's names. */
  options: { customers: ReportOption[]; priceLists: ReportOption[]; products: ReportOption[] };
  summary: {
    rows: number;
    customersWithPriceList: number;
    activeCustomersWithoutPriceList: number;
    entitledProductPrices: number;
    priceLists: number;
  };
};

export async function getCustomerPriceListReport(
  supabase: SupabaseClient,
  companyId: string,
  filters: PriceListReportFilters = {}
): Promise<PriceListReport> {
  const asOf = readDate(filters.asOf, "As at") || today();
  const effectiveFrom = readDate(filters.effectiveFrom, "Effective from");
  const effectiveTo = readDate(filters.effectiveTo, "Effective to");
  const statusInput = text(filters.status).toLowerCase();
  const status: PriceListReportStatus = (["entitled", "active", "inactive", "all"] as const).find((s) => s === statusInput) ?? "entitled";
  const customerId = text(filters.customerId) || null;
  const priceListId = text(filters.priceListId) || null;
  const productId = text(filters.productId) || null;
  const search = text(filters.search).toLowerCase();

  await requireOwned(supabase, companyId, "vyron_customers", customerId, "Customer");
  await requireOwned(supabase, companyId, "vyron_customer_price_lists", priceListId, "Price list");
  await requireOwned(supabase, companyId, "vyron_cost_products", productId, "Product");

  const [customers, assignments, lists] = await Promise.all([
    loadCustomers(supabase, companyId),
    readAll<Record<string, unknown>>((f, t) =>
      supabase.from("vyron_customer_price_list_assignments").select("customer_id, contract_price_list_id, default_price_list_id, status").eq("company_id", companyId).range(f, t)
    ),
    readAll<Record<string, unknown>>((f, t) =>
      supabase.from("vyron_customer_price_lists").select("id, list_name, list_type, status, version, effective_from, effective_to").eq("company_id", companyId).range(f, t)
    ),
  ]);
  const listById = new Map(lists.map((l) => [text(l.id), l]));

  const relevant = assignments.filter((a) => customers.has(text(a.customer_id)) && (!customerId || text(a.customer_id) === customerId));
  const listIds = [...new Set(relevant.flatMap((a) => [text(a.contract_price_list_id), text(a.default_price_list_id)]).filter((id) => id && listById.has(id)))]
    .filter((id) => !priceListId || id === priceListId);

  const items = listIds.length
    ? await readIn<Record<string, unknown>>(listIds, (chunk) =>
        supabase.from("vyron_customer_price_list_items").select("id, price_list_id, product_id, final_price, status, effective_from, effective_to").eq("company_id", companyId).in("price_list_id", chunk)
      )
    : [];
  const productIds = [...new Set(items.map((i) => text(i.product_id)))];
  const products = productIds.length
    ? await readIn<Record<string, unknown>>(productIds, (chunk) =>
        supabase.from("vyron_cost_products").select("id, product_name, sku, status, product_status").eq("company_id", companyId).in("id", chunk)
      )
    : [];
  const productById = new Map(products.map((p) => [text(p.id), p]));

  // The customer's price today, by the rule the order catalogue enforces.
  const entitlement = new Map<string, Map<string, { priceListId: string; price: number }>>();
  await Promise.all(
    [...new Set(relevant.map((a) => text(a.customer_id)))].map(async (cid) => {
      const permitted = await loadCustomerPermittedPrices(supabase, companyId, cid, asOf);
      entitlement.set(cid, new Map([...permitted].map(([pid, p]) => [pid, { priceListId: p.priceListId, price: p.price }])));
    })
  );

  const itemsByList = new Map<string, Record<string, unknown>[]>();
  for (const item of items) {
    const key = text(item.price_list_id);
    if (!itemsByList.has(key)) itemsByList.set(key, []);
    itemsByList.get(key)!.push(item);
  }

  const inWindow = (from: unknown, to: unknown) => (text(from) ? text(from) <= asOf : true) && (text(to) ? text(to) >= asOf : true);
  const rows: PriceListReportRow[] = [];
  for (const a of relevant) {
    const cid = text(a.customer_id);
    const customer = customers.get(cid)!;
    const roles: Array<["Contract" | "Default", string]> = [
      ["Contract", text(a.contract_price_list_id)],
      ["Default", text(a.default_price_list_id)],
    ];
    for (const [role, lid] of roles) {
      if (!lid || !listIds.includes(lid)) continue;
      const list = listById.get(lid)!;
      for (const item of itemsByList.get(lid) || []) {
        const pid = text(item.product_id);
        const product = productById.get(pid);
        if (!product) continue;
        if (productId && pid !== productId) continue;
        const productName = text(product.product_name) || "Product";
        const sku = text(product.sku) || null;
        if (search && !`${productName} ${sku || ""} ${customer.name} ${customer.code || ""} ${text(list.list_name)}`.toLowerCase().includes(search)) continue;
        const itemFrom = text(item.effective_from) || null;
        const itemTo = text(item.effective_to) || null;
        if (effectiveFrom && itemTo && itemTo < effectiveFrom) continue;
        if (effectiveTo && itemFrom && itemFrom > effectiveTo) continue;

        const granted = entitlement.get(cid)?.get(pid);
        const entitled = Boolean(granted && granted.priceListId === lid && productIsActive(product));
        let note: string | null = null;
        if (!entitled) {
          if (text(a.status) !== "Active") note = "Assignment inactive";
          else if (text(list.status).toLowerCase() !== "active") note = "Price list inactive";
          else if (!inWindow(list.effective_from, list.effective_to)) note = "Price list not in date";
          else if (text(item.status) !== "Active") note = "Removed from list";
          else if (text(item.effective_from) && text(item.effective_from) > asOf) note = "Not yet effective";
          else if (text(item.effective_to) && text(item.effective_to) < asOf) note = "Expired";
          else if (!productIsActive(product)) note = "Product inactive";
          else if (granted && granted.priceListId !== lid) note = "Superseded by contract price";
          else note = "Not offered";
        }

        const itemActive = text(item.status) === "Active" && text(a.status) === "Active";
        if (status === "entitled" && !entitled) continue;
        if (status === "active" && !itemActive) continue;
        if (status === "inactive" && itemActive) continue;

        rows.push({
          customerId: cid,
          customerName: customer.name,
          customerCode: customer.code,
          priceListId: lid,
          priceListName: text(list.list_name) || "Price list",
          listType: text(list.list_type) || "Standard",
          role,
          version: num(list.version) || 1,
          listStatus: text(list.status) || "Active",
          assignmentStatus: text(a.status) || "Active",
          productId: pid,
          productName,
          sku,
          listPrice: num(item.final_price),
          itemStatus: text(item.status) || "Active",
          effectiveFrom: itemFrom,
          effectiveTo: itemTo,
          entitled,
          note,
        });
      }
    }
  }
  rows.sort(
    (x, y) =>
      x.customerName.localeCompare(y.customerName) ||
      x.productName.localeCompare(y.productName) ||
      Number(y.entitled) - Number(x.entitled) ||
      (x.role === y.role ? 0 : x.role === "Contract" ? -1 : 1)
  );

  const options = {
    customers: [...customers.entries()].map(([id, c]) => ({ id, name: c.code ? `${c.name} (${c.code})` : c.name })).sort((a, b) => a.name.localeCompare(b.name)),
    priceLists: lists.map((l) => ({ id: text(l.id), name: `${text(l.list_name) || "Price list"} v${num(l.version) || 1}` })).sort((a, b) => a.name.localeCompare(b.name)),
    products: products.map((p) => ({ id: text(p.id), name: text(p.sku) ? `${text(p.product_name)} (${text(p.sku)})` : text(p.product_name) })).sort((a, b) => a.name.localeCompare(b.name)),
  };

  const withList = new Set(assignments.filter((a) => text(a.status) === "Active" && (text(a.contract_price_list_id) || text(a.default_price_list_id))).map((a) => text(a.customer_id)));
  const activeCustomers = [...customers.entries()].filter(([, c]) => c.status.toLowerCase() !== "inactive").map(([id]) => id);
  return {
    asOf,
    status,
    rows,
    options,
    summary: {
      rows: rows.length,
      customersWithPriceList: new Set(rows.map((r) => r.customerId)).size,
      activeCustomersWithoutPriceList: customerId ? 0 : activeCustomers.filter((id) => !withList.has(id)).length,
      entitledProductPrices: rows.filter((r) => r.entitled).length,
      priceLists: new Set(rows.map((r) => r.priceListId)).size,
    },
  };
}

/* ===================================================================== SALES */

export type SalesSource = "invoices" | "orders";

export type SalesReportFilters = {
  source?: string | null;
  from?: string | null;
  to?: string | null;
  customerId?: string | null;
  productId?: string | null;
  search?: string | null;
  /** invoices: "posted" (default) | "all" | a status. orders: "open" (default, not cancelled) | "all" | a status. */
  status?: string | null;
};

export type SalesReportLine = {
  date: string;
  customerId: string | null;
  customerName: string;
  customerCode: string | null;
  reference: string;
  orderReference: string | null;
  transactionId: string;
  status: string;
  productId: string | null;
  productName: string;
  sku: string | null;
  quantity: number;
  /** The selling price recorded on the line — never a price-list lookup. */
  unitPrice: number;
  discountPct: number;
  /** Sales value excluding VAT, from the recorded line. */
  lineValue: number;
};

type Group = { quantity: number; value: number; transactions: number; lines: number; averagePrice: number | null; firstDate: string; lastDate: string };

export type SalesReport = {
  source: SalesSource;
  status: string;
  from: string | null;
  to: string | null;
  lines: SalesReportLine[];
  /** Filter choices from this company only; products are those sold in the period. */
  options: { customers: ReportOption[]; products: ReportOption[] };
  summary: {
    totalValue: number;
    totalQuantity: number;
    transactions: number;
    lines: number;
    customers: number;
    products: number;
    /** Only meaningful for one product; null when the lines span several. */
    averageSellingPrice: number | null;
  };
  byCustomer: Array<{ customerId: string | null; customerName: string; customerCode: string | null } & Group & { items: Array<{ productId: string | null; productName: string; sku: string | null } & Group> }>;
  byProduct: Array<{ productId: string | null; productName: string; sku: string | null } & Group & { customers: Array<{ customerId: string | null; customerName: string; customerCode: string | null } & Group> }>;
};

function group(lines: SalesReportLine[]): Group {
  const quantity = round2(lines.reduce((s, l) => s + l.quantity, 0));
  const value = round2(lines.reduce((s, l) => s + l.lineValue, 0));
  const dates = lines.map((l) => l.date).sort();
  const singleProduct = new Set(lines.map((l) => l.productId || l.productName)).size === 1;
  return {
    quantity,
    value,
    transactions: new Set(lines.map((l) => l.transactionId)).size,
    lines: lines.length,
    averagePrice: singleProduct && quantity > 0 ? round2(value / quantity) : null,
    firstDate: dates[0] || "",
    lastDate: dates[dates.length - 1] || "",
  };
}

function partition<T>(lines: T[], key: (l: T) => string) {
  const map = new Map<string, T[]>();
  for (const l of lines) {
    const k = key(l);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(l);
  }
  return map;
}

const POSTED_INVOICE_STATUSES = ["Posted", "Sent", "Paid"];

export async function getSalesByCustomerItemReport(
  supabase: SupabaseClient,
  companyId: string,
  filters: SalesReportFilters = {}
): Promise<SalesReport> {
  const source: SalesSource = text(filters.source) === "orders" ? "orders" : "invoices";
  const from = readDate(filters.from, "Date from");
  const to = readDate(filters.to, "Date to");
  if (from && to && from > to) throw new PriceListError("Date from must be on or before date to.");
  const customerId = text(filters.customerId) || null;
  const productId = text(filters.productId) || null;
  const search = text(filters.search).toLowerCase();
  const statusInput = text(filters.status);
  const status = statusInput || (source === "invoices" ? "posted" : "open");

  await requireOwned(supabase, companyId, "vyron_customers", customerId, "Customer");
  await requireOwned(supabase, companyId, "vyron_cost_products", productId, "Product");

  const customers = await loadCustomers(supabase, companyId);
  let lines: SalesReportLine[] = [];

  if (source === "invoices") {
    const invoices = await readAll<Record<string, unknown>>((f, t) => {
      let q = supabase
        .from("vyron_customer_invoices")
        .select("id, customer_id, customer_name, invoice_number, invoice_date, status, stock_posted")
        .eq("company_id", companyId);
      if (from) q = q.gte("invoice_date", from);
      if (to) q = q.lte("invoice_date", to);
      if (customerId) q = q.eq("customer_id", customerId);
      return q.order("invoice_date", { ascending: true }).range(f, t);
    });
    const kept = invoices.filter((inv) =>
      status === "all"
        ? true
        : status === "posted"
          ? Boolean(inv.stock_posted) || POSTED_INVOICE_STATUSES.includes(text(inv.status))
          : text(inv.status).toLowerCase() === status.toLowerCase()
    );
    const invoiceById = new Map(kept.map((i) => [text(i.id), i]));
    const ids = [...invoiceById.keys()];
    // Invoice lines carry no company_id: they are reached only through this company's invoices.
    const invoiceLines = ids.length
      ? await readIn<Record<string, unknown>>(ids, (chunk) =>
          supabase.from("vyron_customer_invoice_lines").select("invoice_id, product_id, product_name, quantity, selling_price, discount_percent, taxable_amount, line_total").in("invoice_id", chunk)
        )
      : [];
    const links = ids.length
      ? await readIn<Record<string, unknown>>(ids, (chunk) =>
          supabase.from("vyron_customer_sales_order_invoice_links").select("invoice_id, sales_order_id").eq("company_id", companyId).in("invoice_id", chunk)
        )
      : [];
    const orderIds = [...new Set(links.map((l) => text(l.sales_order_id)))];
    const orders = orderIds.length
      ? await readIn<Record<string, unknown>>(orderIds, (chunk) =>
          supabase.from("vyron_customer_sales_orders").select("id, order_number").eq("company_id", companyId).in("id", chunk)
        )
      : [];
    const orderNumber = new Map(orders.map((o) => [text(o.id), text(o.order_number)]));
    const orderRefByInvoice = new Map<string, string>();
    for (const l of links) {
      const ref = orderNumber.get(text(l.sales_order_id));
      if (ref) orderRefByInvoice.set(text(l.invoice_id), orderRefByInvoice.has(text(l.invoice_id)) ? `${orderRefByInvoice.get(text(l.invoice_id))}, ${ref}` : ref);
    }

    lines = invoiceLines.map((line) => {
      const inv = invoiceById.get(text(line.invoice_id))!;
      const cid = text(inv.customer_id) || null;
      const quantity = num(line.quantity);
      const unitPrice = num(line.selling_price);
      // taxable_amount is the recorded value after discount, before VAT; older
      // lines without it recorded quantity × price as line_total.
      const recorded = line.taxable_amount != null ? num(line.taxable_amount) : line.line_total != null ? num(line.line_total) : quantity * unitPrice;
      return {
        date: text(inv.invoice_date).slice(0, 10),
        customerId: cid,
        customerName: text(inv.customer_name) || (cid ? customers.get(cid)?.name : "") || "Customer",
        customerCode: cid ? customers.get(cid)?.code ?? null : null,
        reference: text(inv.invoice_number) || "Invoice",
        orderReference: orderRefByInvoice.get(text(inv.id)) || null,
        transactionId: text(inv.id),
        status: text(inv.status) || (inv.stock_posted ? "Posted" : ""),
        productId: text(line.product_id) || null,
        productName: text(line.product_name) || "Item",
        sku: null,
        quantity,
        unitPrice,
        discountPct: num(line.discount_percent),
        lineValue: round2(recorded),
      };
    });
  } else {
    const orders = await readAll<Record<string, unknown>>((f, t) => {
      let q = supabase.from("vyron_customer_sales_orders").select("id, order_number, customer_id, customer_name, status, created_at").eq("company_id", companyId);
      if (from) q = q.gte("created_at", `${from}T00:00:00Z`);
      if (to) q = q.lte("created_at", `${to}T23:59:59.999Z`);
      if (customerId) q = q.eq("customer_id", customerId);
      return q.order("created_at", { ascending: true }).range(f, t);
    });
    const kept = orders.filter((o) =>
      status === "all" ? true : status === "open" ? text(o.status).toLowerCase() !== "cancelled" : text(o.status).toLowerCase() === status.toLowerCase()
    );
    const orderById = new Map(kept.map((o) => [text(o.id), o]));
    const ids = [...orderById.keys()];
    const orderLines = ids.length
      ? await readIn<Record<string, unknown>>(ids, (chunk) =>
          supabase.from("vyron_customer_sales_order_lines").select("sales_order_id, product_id, description, quantity, selling_price, discount_pct").eq("company_id", companyId).in("sales_order_id", chunk)
        )
      : [];
    lines = orderLines.map((line) => {
      const order = orderById.get(text(line.sales_order_id))!;
      const cid = text(order.customer_id) || null;
      const quantity = num(line.quantity);
      const unitPrice = num(line.selling_price);
      const discountPct = num(line.discount_pct);
      return {
        date: text(order.created_at).slice(0, 10),
        customerId: cid,
        customerName: text(order.customer_name) || (cid ? customers.get(cid)?.name : "") || "Customer",
        customerCode: cid ? customers.get(cid)?.code ?? null : null,
        reference: text(order.order_number) || "Order",
        orderReference: null,
        transactionId: text(order.id),
        status: text(order.status),
        productId: text(line.product_id) || null,
        productName: text(line.description) || "Item",
        sku: null,
        quantity,
        unitPrice,
        discountPct,
        // Sales-order line_total includes VAT; the value excluding VAT is from the recorded price and discount.
        lineValue: round2(quantity * unitPrice * (1 - discountPct / 100)),
      };
    });
  }

  // SKUs (and current names where the line has none) from this company's products only.
  const productIds = [...new Set(lines.map((l) => l.productId).filter(Boolean) as string[])];
  const products = productIds.length
    ? await readIn<Record<string, unknown>>(productIds, (chunk) =>
        supabase.from("vyron_cost_products").select("id, product_name, sku").eq("company_id", companyId).in("id", chunk)
      )
    : [];
  const productById = new Map(products.map((p) => [text(p.id), p]));
  for (const line of lines) {
    const p = line.productId ? productById.get(line.productId) : undefined;
    line.sku = p ? text(p.sku) || null : null;
    if (!line.productName || line.productName === "Item") line.productName = p ? text(p.product_name) || line.productName : line.productName;
  }

  const soldProducts = new Map<string, string>();
  for (const l of lines) if (l.productId) soldProducts.set(l.productId, l.sku ? `${l.productName} (${l.sku})` : l.productName);
  const options = {
    customers: [...customers.entries()].map(([id, c]) => ({ id, name: c.code ? `${c.name} (${c.code})` : c.name })).sort((a, b) => a.name.localeCompare(b.name)),
    products: [...soldProducts.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };

  if (productId) lines = lines.filter((l) => l.productId === productId);
  if (search) lines = lines.filter((l) => `${l.productName} ${l.sku || ""} ${l.customerName} ${l.customerCode || ""} ${l.reference}`.toLowerCase().includes(search));
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference) || a.productName.localeCompare(b.productName));

  const customerKey = (l: SalesReportLine) => l.customerId || `name:${l.customerName}`;
  const productKey = (l: SalesReportLine) => l.productId || `name:${l.productName}`;

  const byCustomer = [...partition(lines, customerKey).values()]
    .map((cl) => ({
      customerId: cl[0].customerId,
      customerName: cl[0].customerName,
      customerCode: cl[0].customerCode,
      ...group(cl),
      items: [...partition(cl, productKey).values()]
        .map((pl) => ({ productId: pl[0].productId, productName: pl[0].productName, sku: pl[0].sku, ...group(pl) }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);

  const byProduct = [...partition(lines, productKey).values()]
    .map((pl) => ({
      productId: pl[0].productId,
      productName: pl[0].productName,
      sku: pl[0].sku,
      ...group(pl),
      customers: [...partition(pl, customerKey).values()]
        .map((cl) => ({ customerId: cl[0].customerId, customerName: cl[0].customerName, customerCode: cl[0].customerCode, ...group(cl) }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);

  const total = group(lines);
  return {
    source,
    status,
    from,
    to,
    lines,
    options,
    summary: {
      totalValue: total.value,
      totalQuantity: total.quantity,
      transactions: total.transactions,
      lines: total.lines,
      customers: byCustomer.length,
      products: byProduct.length,
      averageSellingPrice: total.averagePrice,
    },
    byCustomer,
    byProduct,
  };
}
