import { apiClient } from "@/services/api";
import type {
  MobileCustomerProfile,
  MobileProductDetail,
  ProductIntelligenceMobileRow,
  SalesCustomer,
  SalesDraftLineInput,
  SalesInvoice,
  SalesProduct,
} from "@/types/sales";

type CustomersResponse = { ok: boolean; customers?: Array<Record<string, unknown>>; error?: string };
type InvoicesResponse = { ok: boolean; invoices?: Array<Record<string, unknown>>; error?: string };
type InvoiceResponse = {
  ok: boolean;
  invoice?: Record<string, unknown>;
  lines?: Array<Record<string, unknown>>;
  error?: string;
};
type ProductsResponse = { ok: boolean; items?: Array<Record<string, unknown>>; error?: string };
type ProductIntelligenceResponse = { ok: boolean; products?: Array<Record<string, unknown>>; error?: string };
type CustomerResponse = { ok: boolean; customer?: Record<string, unknown>; error?: string };
type ProductsMasterResponse = { ok: boolean; products?: Array<Record<string, unknown>>; error?: string };
type RecipesResponse = { ok: boolean; recipes?: Array<Record<string, unknown>>; error?: string };
type RecipeLinesResponse = { ok: boolean; lines?: Array<Record<string, unknown>>; error?: string };

function toNum(value: unknown) {
  return Number(value || 0);
}

function mapInvoiceLine(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    product_id: row.product_id ? String(row.product_id) : null,
    product_name: String(row.product_name || ""),
    quantity: toNum(row.quantity),
    selling_price: toNum(row.selling_price),
    cost_per_unit: toNum(row.cost_per_unit),
    line_total: toNum(row.line_total),
    line_gp: toNum(row.line_gp),
  };
}

function mapInvoice(row: Record<string, unknown>, lines?: Array<Record<string, unknown>>): SalesInvoice {
  return {
    id: String(row.id || ""),
    customer_id: row.customer_id ? String(row.customer_id) : null,
    customer_name: String(row.customer_name || ""),
    invoice_number: String(row.invoice_number || ""),
    invoice_date: String(row.invoice_date || ""),
    due_date: row.due_date ? String(row.due_date) : null,
    status: String(row.status || "Draft"),
    sales_value: toNum(row.sales_value),
    cost_value: toNum(row.cost_value),
    gross_profit: toNum(row.gross_profit),
    gp_percentage: toNum(row.gp_percentage),
    stock_posted: Boolean(row.stock_posted),
    notes: row.notes ? String(row.notes) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    lines: (lines || []).map(mapInvoiceLine),
  };
}

export async function fetchSalesCustomers() {
  const response = await apiClient.get<CustomersResponse>("/api/customers");
  if (!response.ok) throw new Error(response.error || "Failed to load customers.");
  const customers = (response.customers || [])
    .map((row) => ({
      id: String(row.id || ""),
      customer_name: String(row.customer_name || ""),
      email: row.email ? String(row.email) : null,
      invoice_email: row.invoice_email ? String(row.invoice_email) : null,
      terms: row.terms ? String(row.terms) : null,
      status: row.status ? String(row.status) : null,
      total_sales: toNum(row.total_sales),
      invoice_count: toNum(row.invoice_count),
      average_invoice_value: toNum(row.average_invoice_value),
    }))
    .filter((row) => row.customer_name && row.status !== "Inactive");
  return customers as SalesCustomer[];
}

export async function fetchSalesProducts(search?: string) {
  const response = await apiClient.get<ProductsResponse>("/api/inventory/finished-goods");
  if (!response.ok) throw new Error(response.error || "Failed to load products.");

  let products = (response.items || []).map((row) => ({
    id: String(row.productId || row.entity_id || ""),
    product_name: String(row.product_name || ""),
    sku: row.sku ? String(row.sku) : null,
    selling_price: toNum(row.selling_price),
    average_unit_cost: toNum(row.average_unit_cost),
    current_stock: toNum(row.current_stock ?? row.qty_on_hand),
    qty_on_hand: toNum(row.qty_on_hand),
    unit: row.unit ? String(row.unit) : null,
    status: row.status ? String(row.status) : null,
  }));

  if (search?.trim()) {
    const needle = search.trim().toLowerCase();
    products = products.filter(
      (row) => row.product_name.toLowerCase().includes(needle) || String(row.sku || "").toLowerCase().includes(needle)
    );
  }

  return products as SalesProduct[];
}

export async function fetchSalesInvoices(filters?: { status?: string; search?: string }) {
  const response = await apiClient.get<InvoicesResponse>("/api/customer-invoices");
  if (!response.ok) throw new Error(response.error || "Failed to load invoices.");

  let invoices = (response.invoices || []).map((row) => mapInvoice(row));

  if (filters?.status && filters.status !== "All") {
    invoices = invoices.filter((row) => row.status === filters.status);
  }

  if (filters?.search?.trim()) {
    const needle = filters.search.trim().toLowerCase();
    invoices = invoices.filter((row) =>
      [row.invoice_number, row.customer_name, row.status].join(" ").toLowerCase().includes(needle)
    );
  }

  return invoices;
}

export async function fetchSalesInvoiceDetail(invoiceId: string) {
  const response = await apiClient.get<InvoiceResponse>(`/api/customer-invoices/${invoiceId}`);
  if (!response.ok || !response.invoice) {
    throw new Error(response.error || "Invoice not found.");
  }
  return mapInvoice(response.invoice, response.lines);
}

export async function createSalesDraftInvoice(input: {
  customerId: string;
  customerName: string;
  notes?: string;
  lines: SalesDraftLineInput[];
}) {
  const response = await apiClient.post<InvoiceResponse>("/api/customer-invoices", {
    customerId: input.customerId,
    customerName: input.customerName,
    notes: input.notes || null,
    lines: input.lines.map((line) => ({
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      sellingPrice: line.sellingPrice,
      costPerUnit: line.costPerUnit,
    })),
  });
  if (!response.ok || !response.invoice) {
    throw new Error(response.error || "Could not create draft invoice.");
  }
  return mapInvoice(response.invoice, response.lines);
}

export async function updateSalesInvoiceStatus(
  invoiceId: string,
  action: "approve" | "send" | "email" | "paid" | "cancel" | "pdf" | "whatsapp" | "signature",
  extra?: { signer?: string }
) {
  const response = await apiClient.patch<InvoiceResponse>(`/api/customer-invoices/${invoiceId}`, {
    action,
    signer: extra?.signer,
  });
  if (!response.ok || !response.invoice) {
    throw new Error(response.error || "Could not update invoice.");
  }
  return mapInvoice(response.invoice, response.lines);
}

export async function fetchMobileProductIntelligence() {
  const response = await apiClient.get<ProductIntelligenceResponse>("/api/reports/product-intelligence");
  if (!response.ok) throw new Error(response.error || "Failed to load product intelligence.");

  return (response.products || []).map((row) => {
    const selling = toNum(row.sellingPrice ?? row.selling_price);
    const cost = toNum(row.totalCost ?? row.total_cost);
    const gpPct = toNum(row.gpPct ?? row.gp_percentage);
    const targetGp = toNum(row.targetGp ?? row.target_gp);
    const warning = gpPct < targetGp ? "Margin below target" : "Healthy";

    return {
      id: String(row.productId || row.id || ""),
      productId: String(row.productId || row.id || ""),
      productName: String(row.productName || row.product_name || ""),
      category: String(row.category || "General"),
      sellingPrice: selling,
      customerPrice: selling,
      costPrice: cost,
      estimatedCost: cost,
      actualCost: cost,
      gp: toNum(row.grossProfit ?? row.gross_profit),
      gpPct,
      targetGp,
      stock: toNum(row.stockOnHand ?? row.stock_on_hand),
      warning,
    } as ProductIntelligenceMobileRow;
  });
}

export async function fetchMobileCustomerProfile(customerId: string): Promise<MobileCustomerProfile> {
  const [customerRes, invoicesRes] = await Promise.all([
    apiClient.get<CustomerResponse>(`/api/customers/${customerId}`),
    apiClient.get<InvoicesResponse>("/api/customer-invoices"),
  ]);

  if (!customerRes.ok || !customerRes.customer) {
    throw new Error(customerRes.error || "Customer not found.");
  }
  if (!invoicesRes.ok) {
    throw new Error(invoicesRes.error || "Could not load customer invoices.");
  }

  const invoices = (invoicesRes.invoices || [])
    .filter((row) => String(row.customer_id || "") === customerId)
    .map((row) => mapInvoice(row));

  const outstandingBalance = invoices
    .filter((row) => !["Paid", "Cancelled"].includes(row.status))
    .reduce((sum, row) => sum + row.sales_value, 0);

  const salesOrders = invoices
    .filter((row) => ["Draft", "Approved"].includes(row.status))
    .map((row) => ({
      id: row.id,
      number: row.invoice_number,
      status: row.status,
      total: row.sales_value,
      createdAt: row.created_at || row.invoice_date,
    }));

  return {
    id: String(customerRes.customer.id || ""),
    customerName: String(customerRes.customer.customer_name || ""),
    contactEmail: customerRes.customer.email ? String(customerRes.customer.email) : null,
    invoiceEmail: customerRes.customer.invoice_email ? String(customerRes.customer.invoice_email) : null,
    phone: customerRes.customer.phone ? String(customerRes.customer.phone) : null,
    terms: customerRes.customer.terms ? String(customerRes.customer.terms) : null,
    status: customerRes.customer.status ? String(customerRes.customer.status) : null,
    outstandingBalance,
    creditLimit: customerRes.customer.credit_limit ? toNum(customerRes.customer.credit_limit) : null,
    totalSales: toNum(customerRes.customer.total_sales),
    invoiceCount: toNum(customerRes.customer.invoice_count),
    averageInvoiceValue: toNum(customerRes.customer.average_invoice_value),
    assignedPriceSheet: customerRes.customer.price_sheet_name ? String(customerRes.customer.price_sheet_name) : null,
    deliveryAddresses: [
      String(customerRes.customer.delivery_address || "").trim(),
      String(customerRes.customer.address || "").trim(),
    ].filter(Boolean),
    lastPurchases: invoices.slice(0, 5).map((invoice) => ({
      invoiceNumber: invoice.invoice_number,
      date: invoice.invoice_date,
      value: invoice.sales_value,
    })),
    invoices,
    salesOrders,
  };
}

export async function fetchMobileProductDetail(input: { productId?: string; barcode?: string }): Promise<MobileProductDetail> {
  const [productsRes, fgRes, piRes, recipesRes] = await Promise.all([
    apiClient.get<ProductsMasterResponse>("/api/products"),
    apiClient.get<ProductsResponse>("/api/inventory/finished-goods"),
    apiClient.get<ProductIntelligenceResponse>("/api/reports/product-intelligence"),
    apiClient.get<RecipesResponse>("/api/recipes"),
  ]);

  if (!productsRes.ok || !fgRes.ok || !piRes.ok || !recipesRes.ok) {
    throw new Error("Could not load product detail.");
  }

  const products = productsRes.products || [];
  const product = products.find((row) => {
    if (input.productId && String(row.id || "") === input.productId) return true;
    if (input.barcode) {
      const needle = input.barcode.toLowerCase();
      return [row.product_name, row.sku, row.barcode]
        .map((part) => String(part || "").toLowerCase())
        .some((part) => part.includes(needle));
    }
    return false;
  });

  if (!product) {
    throw new Error("Product not found.");
  }

  const fg = (fgRes.items || []).find((row) => String(row.productId || row.id || "") === String(product.id || ""));
  const pi = (piRes.products || []).find((row) => String(row.id || row.productId || "") === String(product.id || ""));

  const linkedBomId = String(product.linked_bom_id || "").trim();
  let recipeSummary: Array<{ item: string; qty: number; unit: string }> = [];
  if (linkedBomId) {
    const linesRes = await apiClient.get<RecipeLinesResponse>(`/api/recipes/${linkedBomId}/lines`);
    if (linesRes.ok) {
      recipeSummary = (linesRes.lines || []).slice(0, 8).map((line) => ({
        item: String(line.line_name || "Item"),
        qty: toNum(line.quantity),
        unit: String(line.unit || "unit"),
      }));
    }
  } else {
    const byName = (recipesRes.recipes || []).find(
      (row) => String(row.recipe_name || "").toLowerCase() === String(product.product_name || "").toLowerCase()
    );
    if (byName?.id) {
      const linesRes = await apiClient.get<RecipeLinesResponse>(`/api/recipes/${String(byName.id)}/lines`);
      if (linesRes.ok) {
        recipeSummary = (linesRes.lines || []).slice(0, 8).map((line) => ({
          item: String(line.line_name || "Item"),
          qty: toNum(line.quantity),
          unit: String(line.unit || "unit"),
        }));
      }
    }
  }

  const sellingPrice = toNum(product.selling_price ?? fg?.selling_price ?? pi?.sellingPrice);
  const cost = toNum(product.total_cost ?? fg?.average_unit_cost ?? pi?.totalCost);
  const targetGp = toNum(product.target_gp ?? pi?.targetGp ?? 40);
  const gpPct = sellingPrice > 0 ? ((sellingPrice - cost) / sellingPrice) * 100 : 0;

  return {
    id: String(product.id || ""),
    productName: String(product.product_name || ""),
    imageUrl: product.image_url ? String(product.image_url) : null,
    barcode: (product.barcode ? String(product.barcode) : String(product.sku || fg?.sku || "")) || null,
    stock: toNum(fg?.current_stock ?? fg?.qty_on_hand),
    customerPrice: sellingPrice,
    sellingPrice,
    cost,
    estimatedCost: toNum(pi?.estimatedCost ?? cost),
    actualCost: toNum(pi?.actualCost ?? cost),
    gpPct,
    targetGp,
    warning: gpPct < targetGp ? "Margin below target" : "Healthy",
    recipeSummary,
  };
}
