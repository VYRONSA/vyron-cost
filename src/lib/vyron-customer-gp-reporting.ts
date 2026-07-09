import type { SupabaseClient } from "@supabase/supabase-js";

type CustomerInvoiceRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  stock_posted: boolean;
  sales_value: number;
  cost_value: number;
  gross_profit: number;
};

type InvoiceLineRow = {
  invoice_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  selling_price: number;
  cost_per_unit: number;
};

type ProductRow = {
  id: string;
  product_name: string;
  category: string | null;
};

type CustomerRow = {
  id: string;
  customer_name: string;
  category: string | null;
};

type SalesOrderRow = {
  id: string;
  salesperson: string | null;
  warehouse: string | null;
};

type InvoiceOrderLink = {
  invoice_id: string;
  sales_order_id: string;
};

export type CustomerGpFilters = {
  customerId?: string | null;
  customerGroup?: string | null;
  salesperson?: string | null;
  warehouse?: string | null;
  from?: string | null;
  to?: string | null;
  productId?: string | null;
  productCategory?: string | null;
  priceListId?: string | null;
  search?: string | null;
};

export type CustomerGpProductBreakdown = {
  productId: string | null;
  productName: string;
  category: string;
  qty: number;
  revenue: number;
  cost: number;
  gp: number;
  gpPct: number;
  marginPct: number;
  markupPct: number;
  avgSellingPrice: number;
  avgCostPrice: number;
};

export type CustomerGpInvoiceBreakdown = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerId: string | null;
  customerName: string;
  customerGroup: string;
  salesperson: string;
  warehouse: string;
  revenue: number;
  cost: number;
  gp: number;
  gpPct: number;
  marginPct: number;
  markupPct: number;
  qtySold: number;
  avgSellingPrice: number;
  avgCostPrice: number;
};

export type CustomerGpCustomerBreakdown = {
  customerId: string | null;
  customerName: string;
  customerGroup: string;
  revenue: number;
  cost: number;
  gp: number;
  gpPct: number;
  marginPct: number;
  markupPct: number;
  qtySold: number;
  avgSellingPrice: number;
  avgCostPrice: number;
  products: CustomerGpProductBreakdown[];
  invoices: CustomerGpInvoiceBreakdown[];
};

export type CustomerGpReport = {
  metrics: {
    revenue: number;
    costOfSales: number;
    grossProfit: number;
    gpPct: number;
    marginPct: number;
    markupPct: number;
    qtySold: number;
    avgSellingPrice: number;
    avgCostPrice: number;
  };
  byCustomer: CustomerGpCustomerBreakdown[];
  byProduct: CustomerGpProductBreakdown[];
  byInvoice: CustomerGpInvoiceBreakdown[];
  byMonth: Array<{ month: string; revenue: number; cost: number; gp: number; gpPct: number }>;
  byYear: Array<{ year: string; revenue: number; cost: number; gp: number; gpPct: number }>;
  topPerformingProducts: CustomerGpProductBreakdown[];
  lowestMarginProducts: CustomerGpProductBreakdown[];
  lossMakingProducts: CustomerGpProductBreakdown[];
  charts: {
    gpTrend: Array<{ period: string; gpPct: number }>;
    monthlyGp: Array<{ month: string; gp: number }>;
    revenueVsCost: Array<{ month: string; revenue: number; cost: number }>;
    top10CustomersByGp: Array<{ customer: string; gp: number }>;
    top10ProductsByGp: Array<{ product: string; gp: number }>;
  };
  filtersApplied: CustomerGpFilters;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function safePct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

function computeMetrics(revenue: number, cost: number, qtySold: number) {
  const gp = revenue - cost;
  const avgSellingPrice = qtySold > 0 ? revenue / qtySold : 0;
  const avgCostPrice = qtySold > 0 ? cost / qtySold : 0;
  return {
    revenue: round2(revenue),
    cost: round2(cost),
    gp: round2(gp),
    gpPct: round2(safePct(gp, revenue)),
    marginPct: round2(safePct(gp, revenue)),
    markupPct: round2(safePct(gp, cost)),
    avgSellingPrice: round4(avgSellingPrice),
    avgCostPrice: round4(avgCostPrice),
  };
}

function normalizeFilterValue(value: string | null | undefined) {
  const clean = String(value || "").trim();
  return clean ? clean : null;
}

export async function writeReportAudit(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    reportKey: string;
    eventType: string;
    actor?: string;
    detail?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("vyron_report_audit_log").insert({
    company_id: params.companyId,
    report_key: params.reportKey,
    event_type: params.eventType,
    actor: params.actor || "system",
    detail: params.detail || null,
    metadata: params.metadata || {},
  });
}

function applySearch(
  rows: CustomerGpInvoiceBreakdown[],
  productByInvoice: Map<string, Set<string>>,
  search: string | null
) {
  if (!search) return rows;
  const needle = search.toLowerCase();
  return rows.filter((row) => {
    const products = [...(productByInvoice.get(row.invoiceId) || new Set())].join(" ").toLowerCase();
    return [
      row.invoiceNumber,
      row.customerName,
      row.customerGroup,
      row.salesperson,
      row.warehouse,
      products,
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

export async function getCustomerGpReport(
  supabase: SupabaseClient,
  companyId: string,
  filters: CustomerGpFilters = {}
): Promise<CustomerGpReport> {
  const normalizedFilters: CustomerGpFilters = {
    customerId: normalizeFilterValue(filters.customerId),
    customerGroup: normalizeFilterValue(filters.customerGroup),
    salesperson: normalizeFilterValue(filters.salesperson),
    warehouse: normalizeFilterValue(filters.warehouse),
    from: normalizeFilterValue(filters.from),
    to: normalizeFilterValue(filters.to),
    productId: normalizeFilterValue(filters.productId),
    productCategory: normalizeFilterValue(filters.productCategory),
    priceListId: normalizeFilterValue(filters.priceListId),
    search: normalizeFilterValue(filters.search),
  };

  let invoiceQuery = supabase
    .from("vyron_customer_invoices")
    .select("id, company_id, customer_id, customer_name, invoice_number, invoice_date, status, stock_posted, sales_value, cost_value, gross_profit")
    .eq("company_id", companyId)
    .order("invoice_date", { ascending: false });

  if (normalizedFilters.from) invoiceQuery = invoiceQuery.gte("invoice_date", normalizedFilters.from);
  if (normalizedFilters.to) invoiceQuery = invoiceQuery.lte("invoice_date", normalizedFilters.to);
  if (normalizedFilters.customerId) invoiceQuery = invoiceQuery.eq("customer_id", normalizedFilters.customerId);

  const { data: invoiceRows, error: invoiceError } = await invoiceQuery;
  if (invoiceError) throw new Error(invoiceError.message);

  const postedInvoices = ((invoiceRows || []) as CustomerInvoiceRow[]).filter(
    (row) => Boolean(row.stock_posted) || ["Posted", "Sent", "Paid"].includes(String(row.status || ""))
  );

  const invoiceIds = postedInvoices.map((invoice) => invoice.id);
  if (!invoiceIds.length) {
    return {
      metrics: {
        revenue: 0,
        costOfSales: 0,
        grossProfit: 0,
        gpPct: 0,
        marginPct: 0,
        markupPct: 0,
        qtySold: 0,
        avgSellingPrice: 0,
        avgCostPrice: 0,
      },
      byCustomer: [],
      byProduct: [],
      byInvoice: [],
      byMonth: [],
      byYear: [],
      topPerformingProducts: [],
      lowestMarginProducts: [],
      lossMakingProducts: [],
      charts: {
        gpTrend: [],
        monthlyGp: [],
        revenueVsCost: [],
        top10CustomersByGp: [],
        top10ProductsByGp: [],
      },
      filtersApplied: normalizedFilters,
    };
  }

  const [linesRes, customersRes, productsRes, linksRes, assignmentsRes] = await Promise.all([
    supabase
      .from("vyron_customer_invoice_lines")
      .select("invoice_id, product_id, product_name, quantity, selling_price, cost_per_unit")
      .in("invoice_id", invoiceIds),
    supabase
      .from("vyron_customers")
      .select("id, customer_name, category")
      .eq("company_id", companyId),
    supabase
      .from("vyron_cost_products")
      .select("id, product_name, category")
      .eq("company_id", companyId),
    supabase
      .from("vyron_customer_sales_order_invoice_links")
      .select("invoice_id, sales_order_id")
      .eq("company_id", companyId)
      .in("invoice_id", invoiceIds),
    supabase
      .from("vyron_customer_price_list_assignments")
      .select("customer_id, default_price_list_id, contract_price_list_id")
      .eq("company_id", companyId),
  ]);

  if (linesRes.error) throw new Error(linesRes.error.message);
  if (customersRes.error) throw new Error(customersRes.error.message);
  if (productsRes.error) throw new Error(productsRes.error.message);
  if (linksRes.error) throw new Error(linksRes.error.message);
  if (assignmentsRes.error) throw new Error(assignmentsRes.error.message);

  const lines = (linesRes.data || []) as InvoiceLineRow[];
  const customers = (customersRes.data || []) as CustomerRow[];
  const products = (productsRes.data || []) as ProductRow[];
  const links = (linksRes.data || []) as InvoiceOrderLink[];

  const customerById = new Map(customers.map((row) => [String(row.id), row]));
  const productById = new Map(products.map((row) => [String(row.id), row]));

  const salesOrderIds = [...new Set(links.map((row) => String(row.sales_order_id)))];
  let salesOrders: SalesOrderRow[] = [];
  if (salesOrderIds.length) {
    const soRes = await supabase
      .from("vyron_customer_sales_orders")
      .select("id, salesperson, warehouse")
      .eq("company_id", companyId)
      .in("id", salesOrderIds);
    if (soRes.error) throw new Error(soRes.error.message);
    salesOrders = (soRes.data || []) as SalesOrderRow[];
  }

  const salesOrderById = new Map(salesOrders.map((row) => [String(row.id), row]));
  const orderLinksByInvoice = new Map<string, InvoiceOrderLink[]>();
  for (const link of links) {
    const key = String(link.invoice_id);
    const bucket = orderLinksByInvoice.get(key) || [];
    bucket.push(link);
    orderLinksByInvoice.set(key, bucket);
  }

  const assignmentByCustomer = new Map(
    (assignmentsRes.data || []).map((row) => [String(row.customer_id), row])
  );

  const productByInvoice = new Map<string, Set<string>>();
  for (const line of lines) {
    const key = String(line.invoice_id);
    const bucket = productByInvoice.get(key) || new Set<string>();
    bucket.add(String(line.product_name || ""));
    productByInvoice.set(key, bucket);
  }

  const invoiceLineMap = new Map<string, InvoiceLineRow[]>();
  for (const line of lines) {
    const key = String(line.invoice_id);
    const bucket = invoiceLineMap.get(key) || [];
    bucket.push(line);
    invoiceLineMap.set(key, bucket);
  }

  const byInvoice: CustomerGpInvoiceBreakdown[] = [];

  for (const invoice of postedInvoices) {
    const customer = invoice.customer_id ? customerById.get(String(invoice.customer_id)) : null;
    const group = String(customer?.category || "Uncategorised");
    const invoiceLines = invoiceLineMap.get(String(invoice.id)) || [];

    let qty = 0;
    let lineRevenue = 0;
    let lineCost = 0;

    for (const line of invoiceLines) {
      const lineQty = Number(line.quantity || 0);
      const revenue = lineQty * Number(line.selling_price || 0);
      const cost = lineQty * Number(line.cost_per_unit || 0);
      qty += lineQty;
      lineRevenue += revenue;
      lineCost += cost;
    }

    const revenue = lineRevenue > 0 ? lineRevenue : Number(invoice.sales_value || 0);
    const cost = lineCost > 0 ? lineCost : Number(invoice.cost_value || 0);

    const linksForInvoice = orderLinksByInvoice.get(String(invoice.id)) || [];
    const linkedOrders = linksForInvoice
      .map((link) => salesOrderById.get(String(link.sales_order_id)))
      .filter(Boolean) as SalesOrderRow[];

    const salesperson = linkedOrders[0]?.salesperson || "Unassigned";
    const warehouse = linkedOrders[0]?.warehouse || "Unassigned";

    const metrics = computeMetrics(revenue, cost, qty);

    byInvoice.push({
      invoiceId: String(invoice.id),
      invoiceNumber: String(invoice.invoice_number || ""),
      invoiceDate: String(invoice.invoice_date || ""),
      customerId: invoice.customer_id ? String(invoice.customer_id) : null,
      customerName: String(invoice.customer_name || customer?.customer_name || "Unknown"),
      customerGroup: group,
      salesperson,
      warehouse,
      revenue: metrics.revenue,
      cost: metrics.cost,
      gp: metrics.gp,
      gpPct: metrics.gpPct,
      marginPct: metrics.marginPct,
      markupPct: metrics.markupPct,
      qtySold: round4(qty),
      avgSellingPrice: metrics.avgSellingPrice,
      avgCostPrice: metrics.avgCostPrice,
    });
  }

  let filteredInvoices = byInvoice;

  if (normalizedFilters.customerGroup) {
    const groupNeedle = normalizedFilters.customerGroup.toLowerCase();
    filteredInvoices = filteredInvoices.filter((row) => row.customerGroup.toLowerCase() === groupNeedle);
  }
  if (normalizedFilters.salesperson) {
    const needle = normalizedFilters.salesperson.toLowerCase();
    filteredInvoices = filteredInvoices.filter((row) => row.salesperson.toLowerCase().includes(needle));
  }
  if (normalizedFilters.warehouse) {
    const needle = normalizedFilters.warehouse.toLowerCase();
    filteredInvoices = filteredInvoices.filter((row) => row.warehouse.toLowerCase().includes(needle));
  }

  if (normalizedFilters.priceListId) {
    filteredInvoices = filteredInvoices.filter((row) => {
      if (!row.customerId) return false;
      const assignment = assignmentByCustomer.get(String(row.customerId));
      if (!assignment) return false;
      return (
        String(assignment.default_price_list_id || "") === normalizedFilters.priceListId ||
        String(assignment.contract_price_list_id || "") === normalizedFilters.priceListId
      );
    });
  }

  if (normalizedFilters.search) {
    filteredInvoices = applySearch(filteredInvoices, productByInvoice, normalizedFilters.search);
  }

  const filteredInvoiceIds = new Set(filteredInvoices.map((row) => row.invoiceId));

  let filteredLines = lines.filter((line) => filteredInvoiceIds.has(String(line.invoice_id)));

  if (normalizedFilters.productId) {
    filteredLines = filteredLines.filter((line) => String(line.product_id || "") === normalizedFilters.productId);
  }
  if (normalizedFilters.productCategory) {
    const categoryNeedle = normalizedFilters.productCategory.toLowerCase();
    filteredLines = filteredLines.filter((line) => {
      const category = String(productById.get(String(line.product_id || ""))?.category || "Uncategorised").toLowerCase();
      return category === categoryNeedle;
    });
  }

  if (normalizedFilters.productId || normalizedFilters.productCategory) {
    const allowedInvoices = new Set(filteredLines.map((line) => String(line.invoice_id)));
    filteredInvoices = filteredInvoices.filter((row) => allowedInvoices.has(row.invoiceId));
  }

  const lineBucketsByInvoice = new Map<string, InvoiceLineRow[]>();
  for (const line of filteredLines) {
    const key = String(line.invoice_id);
    const bucket = lineBucketsByInvoice.get(key) || [];
    bucket.push(line);
    lineBucketsByInvoice.set(key, bucket);
  }

  const normalizedInvoices = filteredInvoices.map((invoice) => {
    const invoiceLines = lineBucketsByInvoice.get(invoice.invoiceId) || [];
    if (!invoiceLines.length) return invoice;

    let qty = 0;
    let revenue = 0;
    let cost = 0;
    for (const line of invoiceLines) {
      const lineQty = Number(line.quantity || 0);
      qty += lineQty;
      revenue += lineQty * Number(line.selling_price || 0);
      cost += lineQty * Number(line.cost_per_unit || 0);
    }

    const metrics = computeMetrics(revenue, cost, qty);
    return {
      ...invoice,
      revenue: metrics.revenue,
      cost: metrics.cost,
      gp: metrics.gp,
      gpPct: metrics.gpPct,
      marginPct: metrics.marginPct,
      markupPct: metrics.markupPct,
      qtySold: round4(qty),
      avgSellingPrice: metrics.avgSellingPrice,
      avgCostPrice: metrics.avgCostPrice,
    };
  });

  const byProductMap = new Map<string, { productId: string | null; productName: string; category: string; qty: number; revenue: number; cost: number }>();

  for (const line of filteredLines) {
    const productId = line.product_id ? String(line.product_id) : null;
    const category = String(productById.get(String(productId || ""))?.category || "Uncategorised");
    const name = String(line.product_name || productById.get(String(productId || ""))?.product_name || "Unknown Product");
    const key = `${productId || "none"}::${name}`;
    const bucket = byProductMap.get(key) || {
      productId,
      productName: name,
      category,
      qty: 0,
      revenue: 0,
      cost: 0,
    };
    const qty = Number(line.quantity || 0);
    bucket.qty += qty;
    bucket.revenue += qty * Number(line.selling_price || 0);
    bucket.cost += qty * Number(line.cost_per_unit || 0);
    byProductMap.set(key, bucket);
  }

  const byProduct: CustomerGpProductBreakdown[] = [...byProductMap.values()]
    .map((row) => {
      const metrics = computeMetrics(row.revenue, row.cost, row.qty);
      return {
        productId: row.productId,
        productName: row.productName,
        category: row.category,
        qty: round4(row.qty),
        revenue: metrics.revenue,
        cost: metrics.cost,
        gp: metrics.gp,
        gpPct: metrics.gpPct,
        marginPct: metrics.marginPct,
        markupPct: metrics.markupPct,
        avgSellingPrice: metrics.avgSellingPrice,
        avgCostPrice: metrics.avgCostPrice,
      };
    })
    .sort((a, b) => b.gp - a.gp);

  const byCustomerMap = new Map<string, CustomerGpCustomerBreakdown>();

  for (const invoice of normalizedInvoices) {
    const key = invoice.customerId || `name:${invoice.customerName}`;
    const current = byCustomerMap.get(key) || {
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      customerGroup: invoice.customerGroup,
      revenue: 0,
      cost: 0,
      gp: 0,
      gpPct: 0,
      marginPct: 0,
      markupPct: 0,
      qtySold: 0,
      avgSellingPrice: 0,
      avgCostPrice: 0,
      products: [],
      invoices: [],
    };

    current.revenue += invoice.revenue;
    current.cost += invoice.cost;
    current.qtySold += invoice.qtySold;
    current.invoices.push(invoice);

    const invoiceLines = lineBucketsByInvoice.get(invoice.invoiceId) || [];
    const productMap = new Map(current.products.map((item) => [`${item.productId || "none"}::${item.productName}`, item]));

    for (const line of invoiceLines) {
      const productId = line.product_id ? String(line.product_id) : null;
      const productName = String(line.product_name || productById.get(String(productId || ""))?.product_name || "Unknown Product");
      const category = String(productById.get(String(productId || ""))?.category || "Uncategorised");
      const pKey = `${productId || "none"}::${productName}`;
      const product = productMap.get(pKey) || {
        productId,
        productName,
        category,
        qty: 0,
        revenue: 0,
        cost: 0,
        gp: 0,
        gpPct: 0,
        marginPct: 0,
        markupPct: 0,
        avgSellingPrice: 0,
        avgCostPrice: 0,
      };
      const qty = Number(line.quantity || 0);
      product.qty += qty;
      product.revenue += qty * Number(line.selling_price || 0);
      product.cost += qty * Number(line.cost_per_unit || 0);
      productMap.set(pKey, product);
    }

    current.products = [...productMap.values()].map((product) => {
      const metrics = computeMetrics(product.revenue, product.cost, product.qty);
      return {
        ...product,
        revenue: metrics.revenue,
        cost: metrics.cost,
        gp: metrics.gp,
        gpPct: metrics.gpPct,
        marginPct: metrics.marginPct,
        markupPct: metrics.markupPct,
        avgSellingPrice: metrics.avgSellingPrice,
        avgCostPrice: metrics.avgCostPrice,
      };
    });

    const customerMetrics = computeMetrics(current.revenue, current.cost, current.qtySold);
    current.revenue = customerMetrics.revenue;
    current.cost = customerMetrics.cost;
    current.gp = customerMetrics.gp;
    current.gpPct = customerMetrics.gpPct;
    current.marginPct = customerMetrics.marginPct;
    current.markupPct = customerMetrics.markupPct;
    current.avgSellingPrice = customerMetrics.avgSellingPrice;
    current.avgCostPrice = customerMetrics.avgCostPrice;
    current.qtySold = round4(current.qtySold);

    byCustomerMap.set(key, current);
  }

  const byCustomer = [...byCustomerMap.values()].sort((a, b) => b.gp - a.gp);

  const monthMap = new Map<string, { revenue: number; cost: number }>();
  const yearMap = new Map<string, { revenue: number; cost: number }>();

  for (const invoice of normalizedInvoices) {
    const month = String(invoice.invoiceDate || "").slice(0, 7);
    const year = String(invoice.invoiceDate || "").slice(0, 4);

    const monthBucket = monthMap.get(month) || { revenue: 0, cost: 0 };
    monthBucket.revenue += invoice.revenue;
    monthBucket.cost += invoice.cost;
    monthMap.set(month, monthBucket);

    const yearBucket = yearMap.get(year) || { revenue: 0, cost: 0 };
    yearBucket.revenue += invoice.revenue;
    yearBucket.cost += invoice.cost;
    yearMap.set(year, yearBucket);
  }

  const byMonth = [...monthMap.entries()]
    .map(([month, row]) => {
      const metrics = computeMetrics(row.revenue, row.cost, 0);
      return { month, revenue: metrics.revenue, cost: metrics.cost, gp: metrics.gp, gpPct: metrics.gpPct };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  const byYear = [...yearMap.entries()]
    .map(([year, row]) => {
      const metrics = computeMetrics(row.revenue, row.cost, 0);
      return { year, revenue: metrics.revenue, cost: metrics.cost, gp: metrics.gp, gpPct: metrics.gpPct };
    })
    .sort((a, b) => a.year.localeCompare(b.year));

  const totalRevenue = normalizedInvoices.reduce((sum, row) => sum + row.revenue, 0);
  const totalCost = normalizedInvoices.reduce((sum, row) => sum + row.cost, 0);
  const totalQty = normalizedInvoices.reduce((sum, row) => sum + row.qtySold, 0);
  const totals = computeMetrics(totalRevenue, totalCost, totalQty);

  return {
    metrics: {
      revenue: totals.revenue,
      costOfSales: totals.cost,
      grossProfit: totals.gp,
      gpPct: totals.gpPct,
      marginPct: totals.marginPct,
      markupPct: totals.markupPct,
      qtySold: round4(totalQty),
      avgSellingPrice: totals.avgSellingPrice,
      avgCostPrice: totals.avgCostPrice,
    },
    byCustomer,
    byProduct,
    byInvoice: normalizedInvoices.sort((a, b) => String(b.invoiceDate).localeCompare(String(a.invoiceDate))),
    byMonth,
    byYear,
    topPerformingProducts: byProduct.slice(0, 10),
    lowestMarginProducts: [...byProduct].sort((a, b) => a.marginPct - b.marginPct).slice(0, 10),
    lossMakingProducts: byProduct.filter((row) => row.gp < 0).sort((a, b) => a.gp - b.gp),
    charts: {
      gpTrend: byMonth.map((row) => ({ period: row.month, gpPct: row.gpPct })),
      monthlyGp: byMonth.map((row) => ({ month: row.month, gp: row.gp })),
      revenueVsCost: byMonth.map((row) => ({ month: row.month, revenue: row.revenue, cost: row.cost })),
      top10CustomersByGp: byCustomer.slice(0, 10).map((row) => ({ customer: row.customerName, gp: row.gp })),
      top10ProductsByGp: byProduct.slice(0, 10).map((row) => ({ product: row.productName, gp: row.gp })),
    },
    filtersApplied: normalizedFilters,
  };
}
