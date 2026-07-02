export type SalesCustomer = {
  id: string;
  customer_name: string;
  email: string | null;
  invoice_email: string | null;
  terms: string | null;
  status: string | null;
  total_sales?: number | null;
  invoice_count?: number | null;
  average_invoice_value?: number | null;
};

export type SalesProduct = {
  id: string;
  product_name: string;
  sku?: string | null;
  selling_price: number;
  average_unit_cost: number;
  current_stock: number;
  qty_on_hand?: number;
  unit?: string | null;
  status?: string | null;
};

export type SalesInvoiceLine = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  selling_price: number;
  cost_per_unit: number;
  line_total: number;
  line_gp: number;
};

export type SalesInvoice = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  sales_value: number;
  cost_value: number;
  gross_profit: number;
  gp_percentage: number;
  stock_posted?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  lines?: SalesInvoiceLine[];
};

export type SalesDraftLineInput = {
  productId: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  costPerUnit: number;
};

export type MobileSalesDraft = {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerTerms: string;
  notes: string;
  signatureCaptured: boolean;
  discountPct: number;
  vatPct: number;
  createdAt: string;
  updatedAt: string;
  lines: SalesDraftLineInput[];
};

export type ProductIntelligenceMobileRow = {
  id: string;
  productId: string;
  productName: string;
  category: string;
  sellingPrice: number;
  customerPrice: number;
  costPrice: number;
  estimatedCost: number;
  actualCost: number;
  gp: number;
  gpPct: number;
  targetGp: number;
  stock: number;
  warning: string;
};

export type MobileCustomerProfile = {
  id: string;
  customerName: string;
  contactEmail: string | null;
  invoiceEmail: string | null;
  phone: string | null;
  terms: string | null;
  status: string | null;
  outstandingBalance: number;
  creditLimit: number | null;
  totalSales: number;
  invoiceCount: number;
  averageInvoiceValue: number;
  assignedPriceSheet: string | null;
  deliveryAddresses: string[];
  lastPurchases: Array<{ invoiceNumber: string; date: string; value: number }>;
  invoices: SalesInvoice[];
  salesOrders: Array<{ id: string; number: string; status: string; total: number; createdAt: string }>;
};

export type MobileProductDetail = {
  id: string;
  productName: string;
  imageUrl: string | null;
  barcode: string | null;
  stock: number;
  customerPrice: number;
  sellingPrice: number;
  cost: number;
  estimatedCost: number;
  actualCost: number;
  gpPct: number;
  targetGp: number;
  warning: string;
  recipeSummary: Array<{ item: string; qty: number; unit: string }>;
};
