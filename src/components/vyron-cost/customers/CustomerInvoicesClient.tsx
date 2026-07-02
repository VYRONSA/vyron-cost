"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, Plus, Printer, Save, Trash2 } from "lucide-react";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { useInventoryPermissions, useInvoicePermissions } from "@/hooks/useModulePermissions";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import type { InvoiceStockPostingStatus } from "@/lib/vyron-invoice-stock-status";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

type InvoiceStatus = "Draft" | "Approved" | "Posted" | "Sent" | "Paid" | "Cancelled";

type InvoiceLine = {
  id: string;
  productId?: string;
  description: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  vatRate: number;
};

type CustomerInvoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  customerVatNumber: string;
  customerTerms: string;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  note: string;
  createdAt: string;
  updatedAt: string;
  emailedAt?: string;
  paidAt?: string;
  stockPosted?: boolean;
  stockReversed?: boolean;
  stockPostingStatus?: InvoiceStockPostingStatus;
  salesValue?: number;
  costValue?: number;
  grossProfit?: number;
  gpPercentage?: number;
};

type CustomerOption = {
  id: string;
  name: string;
  email: string;
  vatNumber: string;
  terms: string;
};

type FinishedGoodOption = {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  unitCost: number;
  vatRate: number;
  stockOnHand: number;
};

const STORAGE_KEY = "vyron-cost-customer-invoices-production-v1";

function workspaceStorageKey(workspaceId: string) {
  return `${STORAGE_KEY}:${workspaceId}`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultLine(): InvoiceLine {
  return {
    id: makeId("line"),
    description: "",
    qty: 1,
    unitPrice: 0,
    unitCost: 0,
    vatRate: 15,
  };
}

function parseTermDays(terms: string) {
  if (terms.toUpperCase() === "COD") return 0;
  const match = terms.match(/\d+/);
  return match ? Number(match[0]) : 30;
}

function lineTotals(line: InvoiceLine) {
  const qty = Number(line.qty || 0);
  const excl = qty * Number(line.unitPrice || 0);
  const vat = excl * (Number(line.vatRate || 0) / 100);
  const total = excl + vat;
  const cogs = qty * Number(line.unitCost || 0);
  const gp = excl - cogs;
  return { excl, vat, total, cogs, gp };
}

function invoiceTotals(lines: InvoiceLine[]) {
  return lines.reduce(
    (acc, line) => {
      const t = lineTotals(line);
      acc.excl += t.excl;
      acc.vat += t.vat;
      acc.total += t.total;
      acc.cogs += t.cogs;
      acc.gp += t.gp;
      return acc;
    },
    { excl: 0, vat: 0, total: 0, cogs: 0, gp: 0 }
  );
}

function displayInvoiceTotals(invoice: CustomerInvoice) {
  if (invoice.lines.length > 0) return invoiceTotals(invoice.lines);
  const excl = Number(invoice.salesValue || 0);
  const vat = excl * 0.15;
  return {
    excl,
    vat,
    total: excl + vat,
    cogs: Number(invoice.costValue || 0),
    gp: Number(invoice.grossProfit ?? excl - Number(invoice.costValue || 0)),
  };
}

function nextInvoiceNumber(existing: CustomerInvoice[]) {
  const next = existing.length + 1;
  return `SI-${String(next).padStart(4, "0")}`;
}

function stockPostingStatusFor(invoice: Pick<CustomerInvoice, "stockPosted" | "stockReversed">): InvoiceStockPostingStatus {
  if (invoice.stockReversed) return "Reversed";
  if (invoice.stockPosted) return "Posted";
  return "Not Posted";
}

function mapApiInvoiceLine(row: Record<string, unknown>): InvoiceLine {
  return {
    id: String(row.id || makeId("line")),
    productId: row.product_id ? String(row.product_id) : undefined,
    description: String(row.product_name || ""),
    qty: Number(row.quantity || 0),
    unitPrice: Number(row.selling_price || 0),
    unitCost: Number(row.cost_per_unit || 0),
    vatRate: 15,
  };
}

function mapApiInvoice(row: Record<string, unknown>, lines: InvoiceLine[] = []): CustomerInvoice {
  const stockPosted = Boolean(row.stock_posted);
  const stockReversed = Boolean(row.stock_reversed);
  return {
    id: String(row.id),
    invoiceNumber: String(row.invoice_number || ""),
    customerName: String(row.customer_name || ""),
    customerEmail: "",
    customerVatNumber: "N/A",
    customerTerms: "30 Days",
    invoiceDate: String(row.invoice_date || today()),
    dueDate: String(row.due_date || addDays(String(row.invoice_date || today()), 30)),
    status: (String(row.status || "Draft") as InvoiceStatus) || "Draft",
    lines,
    note: String(row.notes || ""),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    stockPosted,
    stockReversed,
    stockPostingStatus: stockPostingStatusFor({ stockPosted, stockReversed }),
    salesValue: Number(row.sales_value || 0),
    costValue: Number(row.cost_value || 0),
    grossProfit: Number(row.gross_profit || 0),
    gpPercentage: Number(row.gp_percentage || 0),
  };
}

function normaliseCustomer(raw: any, index: number): CustomerOption | null {
  const name = String(
    raw?.name ||
      raw?.customerName ||
      raw?.customer_name ||
      raw?.companyName ||
      raw?.company_name ||
      raw?.tradingName ||
      raw?.trading_name ||
      ""
  ).trim();
  if (!name) return null;

  return {
    id: String(raw?.id || raw?.customerId || `customer-${index}`),
    name,
    email: String(
      raw?.invoiceEmail ||
        raw?.invoice_email ||
        raw?.email ||
        raw?.customerEmail ||
        raw?.customer_email ||
        raw?.contactEmail ||
        raw?.contact_email ||
        ""
    ).trim(),
    vatNumber: String(raw?.vatNumber || raw?.vat_number || raw?.customerVatNumber || raw?.vat || "N/A").trim(),
    terms: String(raw?.terms || raw?.paymentTerms || raw?.payment_terms || "30 Days").trim() || "30 Days",
  };
}

function normaliseFinishedGood(raw: any, index: number): FinishedGoodOption | null {
  const name = String(
    raw?.name ||
      raw?.product_name ||
      raw?.productName ||
      raw?.finishedGoodName ||
      raw?.description ||
      raw?.itemName ||
      ""
  ).trim();

  if (!name) return null;

  const sellingPrice = Number(
    raw?.sellingPrice ??
      raw?.selling_price ??
      raw?.price ??
      raw?.unitPrice ??
      raw?.salesPrice ??
      raw?.suggestedPrice ??
      raw?.suggested_selling_price ??
      raw?.recommendedPrice ??
      0
  );

  const unitCost = Number(
    raw?.unitCost ??
      raw?.total_cost ??
      raw?.cost ??
      raw?.productCost ??
      raw?.standardCost ??
      raw?.cogs ??
      raw?.totalCost ??
      0
  );

  const stockOnHand = Number(
    raw?.stockOnHand ??
      raw?.stock ??
      raw?.qty ??
      raw?.quantity ??
      raw?.unitsInStock ??
      raw?.balance ??
      0
  );

  return {
    id: String(raw?.productId || raw?.id || raw?.product_id || raw?.sku || `fg-${index}`),
    name,
    sku: String(raw?.sku || raw?.code || raw?.productCode || raw?.product_code || "").trim(),
    sellingPrice: Number.isFinite(sellingPrice) ? sellingPrice : 0,
    unitCost: Number.isFinite(unitCost) ? unitCost : 0,
    vatRate: Number(raw?.vatRate ?? raw?.vat ?? 15) || 15,
    stockOnHand: Number.isFinite(stockOnHand) ? stockOnHand : 0,
  };
}

function readRecordsFromStorage(keys: string[]) {
  const rows: any[] = [];

  keys.forEach((key) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) rows.push(...parsed);
      else if (Array.isArray(parsed?.records)) rows.push(...parsed.records);
      else if (Array.isArray(parsed?.items)) rows.push(...parsed.items);
      else if (Array.isArray(parsed?.products)) rows.push(...parsed.products);
      else if (Array.isArray(parsed?.customers)) rows.push(...parsed.customers);
      else if (Array.isArray(parsed?.finishedGoods)) rows.push(...parsed.finishedGoods);
    } catch {
      // Ignore invalid local cache.
    }
  });

  return rows;
}

function readCustomerOptions(workspaceId: string): CustomerOption[] {
  if (typeof window === "undefined") return [];

  const rows = readRecordsFromStorage([
    `vyron-cost-customers:${workspaceId}`,
    `vyron_cost_customers:${workspaceId}`,
    `vyron-cost-customers-production-v1:${workspaceId}`,
    `vyron_cost_customer_master:${workspaceId}`,
    "vyron-cost-customers",
    "vyron_cost_customers",
    "vyron-cost-customers-production-v1",
    "vyron_cost_customer_master",
  ]);

  const unique = new Map<string, CustomerOption>();
  rows.forEach((row, index) => {
    const customer = normaliseCustomer(row, index);
    if (!customer) return;
    const key = customer.name.toLowerCase();
    if (!unique.has(key)) unique.set(key, customer);
  });

  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function readFinishedGoods(workspaceId: string): FinishedGoodOption[] {
  if (typeof window === "undefined") return [];

  const rows = readRecordsFromStorage([
    `vyron-cost-finished-goods:${workspaceId}`,
    `vyron_cost_finished_goods:${workspaceId}`,
    `vyron-cost-products:${workspaceId}`,
    `vyron_cost_products:${workspaceId}`,
    `vyron-cost-product-master:${workspaceId}`,
    `vyron_cost_product_master:${workspaceId}`,
    "vyron-cost-finished-goods",
    "vyron_cost_finished_goods",
    "vyron-cost-products",
    "vyron_cost_products",
    "vyron-cost-product-master",
    "vyron_cost_product_master",
  ]);

  const unique = new Map<string, FinishedGoodOption>();
  rows.forEach((row, index) => {
    const product = normaliseFinishedGood(row, index);
    if (!product) return;
    const key = `${product.name}-${product.sku}`.toLowerCase();
    if (!unique.has(key)) unique.set(key, product);
  });

  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function invoiceEmailBody(invoice: CustomerInvoice) {
  const totals = displayInvoiceTotals(invoice);

  const lineText = invoice.lines
    .map((line) => {
      const t = lineTotals(line);
      return `${line.description || "Invoice line"} | Qty: ${line.qty} | Unit: ${money(line.unitPrice)} | VAT: ${line.vatRate}% | Total: ${money(t.total)}`;
    })
    .join("\n");

  return [
    "Good day,",
    "",
    `Please find invoice ${invoice.invoiceNumber} below.`,
    "",
    `Customer: ${invoice.customerName}`,
    `Invoice Date: ${invoice.invoiceDate}`,
    `Due Date: ${invoice.dueDate}`,
    "",
    lineText,
    "",
    `Subtotal Excl VAT: ${money(totals.excl)}`,
    `VAT: ${money(totals.vat)}`,
    `Total Incl VAT: ${money(totals.total)}`,
    "",
    invoice.note ? `Note: ${invoice.note}` : "",
    "",
    "Kind regards,",
    "VYRON COST",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function CustomerInvoicesClient({ initialFormOpen = false }: { initialFormOpen?: boolean }) {
  const { canCreate, canEdit, canApprove, canEmail, canDelete } = useInvoicePermissions();
  const { canPostAdjustment } = useInventoryPermissions();
  const [workspaceId, setWorkspaceId] = useState("default");
  const [workspaceName, setWorkspaceName] = useState("Current Workspace");
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stockMessage, setStockMessage] = useState("");
  const [stockBusy, setStockBusy] = useState(false);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [finishedGoods, setFinishedGoods] = useState<FinishedGoodOption[]>([]);
  const [formOpen, setFormOpen] = useState(initialFormOpen && canCreate);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [productPickerLineId, setProductPickerLineId] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerVatNumber, setCustomerVatNumber] = useState("");
  const [customerTerms, setCustomerTerms] = useState("30 Days");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState(addDays(today(), 30));
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([defaultLine()]);

  async function loadLiveInvoices() {
    const res = await fetch("/api/customer-invoices");
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.invoices)) {
      setInvoices([]);
      return;
    }
    setInvoices(data.invoices.map((row: Record<string, unknown>) => mapApiInvoice(row)));
  }

  async function loadLiveCustomers() {
    const res = await fetch("/api/customers");
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.customers)) {
      setCustomers([]);
      return;
    }
    setCustomers(
      data.customers
        .map((row: Record<string, unknown>, index: number) => normaliseCustomer(row, index))
        .filter(Boolean) as CustomerOption[]
    );
  }

  async function loadLiveFinishedGoods() {
    const res = await fetch("/api/inventory/finished-goods");
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.items)) {
      setFinishedGoods([]);
      return;
    }

    setFinishedGoods(
      data.items
        .map((row: Record<string, unknown>, index: number) =>
          normaliseFinishedGood(
            {
              id: row.productId || row.entity_id,
              productId: row.productId || row.entity_id,
              productName: row.product_name,
              sku: row.sku,
              sellingPrice: row.selling_price,
              unitCost: row.average_unit_cost,
              stockOnHand: row.current_stock ?? row.qty_on_hand,
              vatRate: 15,
            },
            index
          )
        )
        .filter(Boolean) as FinishedGoodOption[]
    );
  }

  useEffect(() => {
    const client = readActiveClient();
    const id = client?.id || client?.companyId || "default";
    const demo = isDemoWorkspace(client);
    setWorkspaceId(id);
    setWorkspaceName(client?.companyName || client?.tradingName || "Current Workspace");
    setDemoMode(demo);

    async function bootstrap() {
      setLoading(true);
      if (!demo) {
        await Promise.all([loadLiveInvoices(), loadLiveCustomers(), loadLiveFinishedGoods()]);
      } else {
        try {
          const raw = window.localStorage.getItem(workspaceStorageKey(id));
          const parsed = raw ? (JSON.parse(raw) as CustomerInvoice[]) : [];
          setInvoices(Array.isArray(parsed) ? parsed : []);
        } catch {
          setInvoices([]);
        }
        setCustomers(readCustomerOptions(id));
        setFinishedGoods(readFinishedGoods(id));
      }
      setLoading(false);
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    if (initialFormOpen && canCreate) setFormOpen(true);
  }, [initialFormOpen, canCreate]);

  useEffect(() => {
    if (!demoMode) return;
    try {
      window.localStorage.setItem(workspaceStorageKey(workspaceId), JSON.stringify(invoices));
    } catch {
      // Ignore browser storage failure.
    }
  }, [invoices, workspaceId, demoMode]);

  const draftTotals = useMemo(() => invoiceTotals(lines), [lines]);

  const summary = useMemo(() => {
    const activeInvoices = invoices.filter((invoice) => invoice.status !== "Cancelled");
    return activeInvoices.reduce(
      (acc, invoice) => {
        const t = displayInvoiceTotals(invoice);
        acc.excl += t.excl;
        acc.vat += t.vat;
        acc.total += t.total;
        acc.cogs += t.cogs;
        acc.gp += t.gp;
        return acc;
      },
      { excl: 0, vat: 0, total: 0, cogs: 0, gp: 0 }
    );
  }, [invoices]);

  const filteredCustomers = useMemo(() => {
    const term = customerName.trim().toLowerCase();
    const list = term
      ? customers.filter((customer) => customer.name.toLowerCase().includes(term) || customer.email.toLowerCase().includes(term))
      : customers;
    return list.slice(0, 8);
  }, [customers, customerName]);

  const selectedInvoice = selectedInvoiceId ? invoices.find((invoice) => invoice.id === selectedInvoiceId) || null : null;

  function filteredFinishedGoods(line: InvoiceLine) {
    const term = line.description.trim().toLowerCase();
    const list = term
      ? finishedGoods.filter((product) => product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term))
      : finishedGoods;

    return list.slice(0, 8);
  }

  function selectCustomer(customer: CustomerOption) {
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerEmail(customer.email);
    setCustomerVatNumber(customer.vatNumber || "N/A");
    setCustomerTerms(customer.terms || "30 Days");
    setDueDate(addDays(invoiceDate, parseTermDays(customer.terms || "30 Days")));
    setCustomerPickerOpen(false);
  }

  function selectFinishedGood(lineId: string, product: FinishedGoodOption) {
    updateLine(lineId, {
      productId: product.id,
      description: product.name,
      unitPrice: product.sellingPrice,
      unitCost: product.unitCost,
      vatRate: product.vatRate,
    });
    setProductPickerLineId(null);
  }

  function updateLine(id: string, patch: Partial<InvoiceLine>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((current) => [...current, defaultLine()]);
  }

  function removeLine(id: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.id !== id)));
  }

  function resetForm() {
    setCustomerName("");
    setCustomerId(null);
    setCustomerEmail("");
    setCustomerVatNumber("");
    setCustomerTerms("30 Days");
    setInvoiceDate(today());
    setDueDate(addDays(today(), 30));
    setNote("");
    setLines([defaultLine()]);
    setCustomerPickerOpen(false);
    setProductPickerLineId(null);
  }

  async function saveInvoice() {
    if (!canCreate) {
      alert("You do not have permission to create invoices.");
      return;
    }
    const validLines = lines.filter((line) => line.description.trim() && Number(line.qty) > 0);

    if (!customerName.trim()) {
      alert("Customer name is required.");
      return;
    }

    if (!validLines.length) {
      alert("Add at least one finished good or invoice line.");
      return;
    }

    if (!demoMode) {
      const res = await fetch("/api/customer-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customerId || null,
          customerName: customerName.trim(),
          invoiceDate,
          dueDate,
          notes: note.trim(),
          lines: validLines.map((line) => ({
            productId: line.productId || null,
            productName: line.description.trim(),
            quantity: line.qty,
            sellingPrice: line.unitPrice,
            costPerUnit: line.unitCost,
          })),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "Could not save invoice.");
        return;
      }
      const detailRes = await fetch(`/api/customer-invoices/${data.invoice.id}`);
      const detail = await detailRes.json();
      const invoice = detail.ok
        ? mapApiInvoice(
            detail.invoice,
            (detail.lines || []).map((line: Record<string, unknown>) => mapApiInvoiceLine(line))
          )
        : mapApiInvoice(data.invoice, validLines);
      setInvoices((current) => [invoice, ...current]);
      setSelectedInvoiceId(invoice.id);
      resetForm();
      setFormOpen(false);
      return;
    }

    const now = new Date().toISOString();

    const invoice: CustomerInvoice = {
      id: makeId("invoice"),
      invoiceNumber: nextInvoiceNumber(invoices),
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      customerVatNumber: customerVatNumber.trim(),
      customerTerms,
      invoiceDate,
      dueDate,
      status: "Draft",
      lines: validLines,
      note: note.trim(),
      createdAt: now,
      updatedAt: now,
      stockPostingStatus: "Not Posted",
    };

    setInvoices((current) => [invoice, ...current]);
    setSelectedInvoiceId(invoice.id);
    resetForm();
    setFormOpen(false);
  }

  async function updateInvoiceStatus(id: string, status: InvoiceStatus) {
    if (status === "Approved" && !canApprove) {
      alert("You do not have permission to approve invoices.");
      return;
    }
    if (status === "Sent" && !canEmail) {
      alert("You do not have permission to email invoices.");
      return;
    }
    if ((status === "Paid" || status === "Cancelled") && !canEdit) {
      alert("You do not have permission to update invoices.");
      return;
    }

    if (!demoMode) {
      const action =
        status === "Approved"
          ? "approve"
          : status === "Sent"
            ? "send"
            : status === "Paid"
              ? "paid"
              : status === "Cancelled"
                ? "cancel"
                : null;
      const res = await fetch(`/api/customer-invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action ? { action } : { status }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "Could not update invoice.");
        return;
      }
      const updated = mapApiInvoice(data.invoice, invoices.find((inv) => inv.id === id)?.lines || []);
      setInvoices((current) => current.map((invoice) => (invoice.id === id ? updated : invoice)));
      return;
    }

    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === id
          ? {
              ...invoice,
              status,
              updatedAt: new Date().toISOString(),
              emailedAt: status === "Sent" ? invoice.emailedAt || new Date().toISOString() : invoice.emailedAt,
              paidAt: status === "Paid" ? new Date().toISOString() : invoice.paidAt,
            }
          : invoice
      )
    );
  }

  async function refreshSelectedInvoice(id: string) {
    if (demoMode) return;
    const res = await fetch(`/api/customer-invoices/${id}`);
    const data = await res.json();
    if (!data.ok) return;
    const mapped = mapApiInvoice(data.invoice, (data.lines || []).map((line: Record<string, unknown>) => mapApiInvoiceLine(line)));
    setInvoices((current) => current.map((invoice) => (invoice.id === id ? mapped : invoice)));
  }

  useEffect(() => {
    if (!selectedInvoiceId || demoMode) return;
    void refreshSelectedInvoice(selectedInvoiceId);
  }, [selectedInvoiceId, demoMode]);

  async function postInvoiceStock(invoice: CustomerInvoice, allowOverride = false) {
    if (!canApprove) {
      alert("You do not have permission to post invoice stock.");
      return;
    }
    if (demoMode) {
      alert("Stock posting is available for live workspaces only.");
      return;
    }
    setStockBusy(true);
    setStockMessage("");
    const res = await fetch(`/api/customer-invoices/${invoice.id}/post-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowOverride }),
    });
    const data = await res.json();
    setStockBusy(false);
    if (!data.ok) {
      setStockMessage(data.error || "Could not post stock.");
      return;
    }
    if (data.warnings?.length) setStockMessage(data.warnings.join(" "));
    else setStockMessage(data.alreadyPosted ? "Stock was already posted." : "Stock posted successfully.");
    await refreshSelectedInvoice(invoice.id);
    await loadLiveInvoices();
    await loadLiveFinishedGoods();
  }

  async function reverseInvoiceStock(invoice: CustomerInvoice) {
    if (!canApprove) {
      alert("You do not have permission to reverse invoice stock.");
      return;
    }
    if (demoMode) {
      alert("Stock reversal is available for live workspaces only.");
      return;
    }
    if (!confirm(`Reverse stock for invoice ${invoice.invoiceNumber}?`)) return;
    setStockBusy(true);
    setStockMessage("");
    const res = await fetch(`/api/customer-invoices/${invoice.id}/reverse-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setStockBusy(false);
    if (!data.ok) {
      setStockMessage(data.error || "Could not reverse stock.");
      return;
    }
    setStockMessage(data.alreadyReversed ? "Stock was already reversed." : "Stock reversed successfully.");
    await refreshSelectedInvoice(invoice.id);
    await loadLiveInvoices();
    await loadLiveFinishedGoods();
  }

  function invoiceHasUnlinkedStock(invoice: CustomerInvoice) {
    return invoice.lines.some((line) => !line.productId);
  }

  async function deleteInvoice(id: string) {
    if (!canDelete) {
      alert("You do not have permission to delete invoices.");
      return;
    }
    if (!confirm("Delete this invoice?")) return;
    if (!demoMode) {
      const res = await fetch(`/api/customer-invoices/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "Could not delete invoice.");
        return;
      }
    }
    setInvoices((current) => current.filter((invoice) => invoice.id !== id));
    if (selectedInvoiceId === id) setSelectedInvoiceId(null);
  }

  function emailHref(invoice: CustomerInvoice) {
    const subject = encodeURIComponent(`Invoice ${invoice.invoiceNumber} - ${invoice.customerName}`);
    const body = encodeURIComponent(invoiceEmailBody(invoice));
    return `mailto:${encodeURIComponent(invoice.customerEmail)}?subject=${subject}&body=${body}`;
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "customers",
        badge: "Premium Sales Workspace",
        title: "Customer Invoicing Command Centre",
        subtitle: `Create, approve, email and track sales invoices for ${workspaceName} — with GP visibility and stock posting discipline.`,
        outcomes: [
          "Create and approve customer invoices",
          "Email invoices and track status",
          "Post and reverse finished goods stock",
          "Monitor GP % on every sale",
        ],
        formulaTitle: "Invoice margin formulas",
        formulas: [
          { label: "Line GP", formula: "(Unit Price − Unit Cost) × Qty" },
          { label: "Invoice GP %", formula: "(Sales − Cost) ÷ Sales × 100" },
          { label: "Stock Impact", formula: "Qty sold × weighted average FG cost" },
        ],
        intelligenceTitle: "Margin Intelligence",
        intelligenceItems: [
          { label: "GP per invoice", detail: "Every invoice should protect target margin before it is sent." },
          { label: "Stock posting", detail: "Posted invoices reduce finished goods — margin and inventory must agree." },
          { label: "Debtor control", detail: "Status tracking from draft through paid supports cash discipline." },
        ],
      }}
    >
    <div className="mx-auto w-full max-w-[1180px] space-y-6 overflow-x-hidden">
      <section className="rounded-[32px] border border-violet-100 bg-white/90 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.08)] md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">Workspace</p>
            <h2 className="mt-1 text-xl font-black text-slate-950 md:text-2xl">{workspaceName}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Invoice workspace actions and status controls.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreate ? (
            <button
              type="button"
              onClick={() => setFormOpen((open) => !open)}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/20"
            >
              <Plus size={17} />
              {formOpen ? "Close Invoice" : "Create Invoice"}
            </button>
            ) : null}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-white px-5 py-3 text-sm font-black text-violet-800"
            >
              <Printer size={17} />
              Print
            </button>
          </div>
        </div>
      </section>

      {invoices.length === 0 ? (
        <section className="rounded-[32px] border border-dashed border-violet-200 bg-violet-50/50 p-8 text-center">
          <h2 className="text-2xl font-black text-slate-950">No customer invoices yet</h2>
          <p className="mt-3 text-sm font-semibold text-slate-600">
            Create your first invoice from this workspace. No demo invoices are shown.
          </p>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric title="Sales Excl" value={money(summary.excl)} />
        <Metric title="VAT" value={money(summary.vat)} />
        <Metric title="Total" value={money(summary.total)} />
        <Metric title="Gross Profit" value={money(summary.gp)} />
        <Metric title="GP %" value={`${summary.excl ? ((summary.gp / summary.excl) * 100).toFixed(1) : "0.0"}%`} />
      </div>

      {formOpen && canCreate ? (
        <section className="rounded-[32px] border border-violet-100 bg-white/95 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.08)] md:p-6">
          <h2 className="text-2xl font-black text-slate-950">Create Customer Invoice</h2>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[28px] border border-violet-100 bg-violet-50/40 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="relative md:col-span-2">
                  <Input
                    label="Customer Name"
                    value={customerName}
                    onFocus={() => setCustomerPickerOpen(true)}
                    onChange={(value) => {
                      setCustomerName(value);
                      setCustomerId(null);
                      setCustomerPickerOpen(true);
                    }}
                  />
                  {customerPickerOpen ? (
                    <PickerBox>
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => selectCustomer(customer)}
                            className="flex w-full items-start justify-between gap-3 border-b border-violet-50 px-4 py-3 text-left transition hover:bg-violet-50"
                          >
                            <span>
                              <span className="block text-sm font-black text-slate-950">{customer.name}</span>
                              <span className="block text-xs font-semibold text-slate-500">{customer.email || "No invoice email captured"}</span>
                            </span>
                            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-800">{customer.terms}</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-sm font-bold text-amber-700">
                          No customers found. Add customers under Customers, or type manually.
                        </div>
                      )}
                    </PickerBox>
                  ) : null}
                </div>
                <Input label="Customer Email" value={customerEmail} onChange={setCustomerEmail} type="email" />
                <Input label="Customer VAT Number" value={customerVatNumber} onChange={setCustomerVatNumber} />
                <label>
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Terms</span>
                  <select
                    value={customerTerms}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCustomerTerms(value);
                      setDueDate(addDays(invoiceDate, parseTermDays(value)));
                    }}
                    className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold outline-none"
                  >
                    <option>COD</option>
                    <option>7 Days</option>
                    <option>14 Days</option>
                    <option>30 Days</option>
                    <option>60 Days</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-[28px] border border-violet-100 bg-white p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Invoice Date"
                  value={invoiceDate}
                  onChange={(value) => {
                    setInvoiceDate(value);
                    setDueDate(addDays(value, parseTermDays(customerTerms)));
                  }}
                  type="date"
                />
                <Input label="Due Date" value={dueDate} onChange={setDueDate} type="date" />
                <div className="md:col-span-2">
                  <Input label="Invoice Note" value={note} onChange={setNote} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-violet-100 bg-violet-50/30 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">Finished goods to sell</p>
                <p className="text-sm font-semibold text-slate-500">Select finished products. Prices and costs fill automatically when product master data exists.</p>
              </div>
              {finishedGoods.length === 0 ? (
                <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">No finished goods master found yet</span>
              ) : (
                <span className="rounded-full border border-[#A3E635]/25 bg-[#A3E635]/10 px-3 py-2 text-xs font-black text-[#65A30D]">{finishedGoods.length} finished goods loaded</span>
              )}
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => {
                const totals = lineTotals(line);
                const products = filteredFinishedGoods(line);

                return (
                  <div key={line.id} className="rounded-[24px] border border-violet-100 bg-white p-4">
                    <div className="grid gap-3 lg:grid-cols-[70px_minmax(220px,1fr)_90px_125px_125px_90px] lg:items-start">
                      <div className="rounded-2xl bg-violet-100 px-3 py-3 text-center text-sm font-black text-violet-800">Line {index + 1}</div>

                      <div className="relative">
                        <Input
                          label="Finished Good / Product"
                          value={line.description}
                          onFocus={() => setProductPickerLineId(line.id)}
                          onChange={(value) => {
                            updateLine(line.id, { description: value, productId: undefined });
                            setProductPickerLineId(line.id);
                          }}
                        />
                        {productPickerLineId === line.id ? (
                          <PickerBox>
                            {products.length > 0 ? (
                              products.map((product) => (
                                <button
                                  key={product.id}
                                  type="button"
                                  onClick={() => selectFinishedGood(line.id, product)}
                                  className="flex w-full items-start justify-between gap-3 border-b border-violet-50 px-4 py-3 text-left transition hover:bg-violet-50"
                                >
                                  <span>
                                    <span className="block text-sm font-black text-slate-950">{product.name}</span>
                                    <span className="block text-xs font-semibold text-slate-500">
                                      {product.sku ? `${product.sku} • ` : ""}Stock {product.stockOnHand}
                                    </span>
                                  </span>
                                  <span className="text-right text-xs font-black text-slate-700">
                                    {money(product.sellingPrice)}
                                    <span className="block text-[#65A30D]">Cost {money(product.unitCost)}</span>
                                  </span>
                                </button>
                              ))
                            ) : (
                              <div className="px-4 py-3 text-sm font-bold text-amber-700">
                                No finished goods found. Add products/finished goods, or type manually.
                              </div>
                            )}
                          </PickerBox>
                        ) : null}
                      </div>

                      <NumberInput label="Qty" value={line.qty} onChange={(value) => updateLine(line.id, { qty: value })} />
                      <NumberInput label="Unit Price Excl" value={line.unitPrice} onChange={(value) => updateLine(line.id, { unitPrice: value })} />
                      <NumberInput label="Unit Cost" value={line.unitCost} onChange={(value) => updateLine(line.id, { unitCost: value })} />
                      <NumberInput label="VAT %" value={line.vatRate} onChange={(value) => updateLine(line.id, { vatRate: value })} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap gap-4 text-sm font-black text-slate-700">
                        <span>Line Total: <b className="text-slate-950">{money(totals.total)}</b></span>
                        <span>COGS: <b className="text-slate-950">{money(totals.cogs)}</b></span>
                        <span>GP: <b className="text-[#65A30D]">{money(totals.gp)}</b></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-100 bg-white px-3 py-2 text-xs font-black text-rose-700"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-violet-100 bg-white p-4">
            <div className="flex flex-wrap gap-4 text-sm font-black text-slate-700">
              <span>Excl: <b className="text-slate-950">{money(draftTotals.excl)}</b></span>
              <span>VAT: <b className="text-slate-950">{money(draftTotals.vat)}</b></span>
              <span>Total: <b className="text-slate-950">{money(draftTotals.total)}</b></span>
              <span>COGS: <b className="text-slate-950">{money(draftTotals.cogs)}</b></span>
              <span>GP: <b className="text-[#65A30D]">{money(draftTotals.gp)}</b></span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={addLine} className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-white px-5 py-3 text-sm font-black text-violet-800">
                <Plus size={17} />
                Add Line
              </button>
              <button type="button" onClick={saveInvoice} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
                <Save size={17} />
                Save Invoice
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">Invoice Register</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Draft, approve, email and mark invoices as paid.</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[24px] border border-violet-100">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.12em] text-white">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Excl</th>
                <th className="px-4 py-3 text-right">VAT</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const totals = displayInvoiceTotals(invoice);
                return (
                  <tr key={invoice.id} className="border-t border-violet-50">
                    <td className="px-4 py-4 font-black text-violet-700">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-4 font-black text-slate-950">{invoice.customerName}</td>
                    <td className="px-4 py-4 font-semibold text-slate-600">{invoice.invoiceDate}</td>
                    <td className="px-4 py-4 text-right font-black">{money(totals.excl)}</td>
                    <td className="px-4 py-4 text-right font-black">{money(totals.vat)}</td>
                    <td className="px-4 py-4 text-right font-black">{money(totals.total)}</td>
                    <td className="px-4 py-4"><StatusBadge status={invoice.status} /></td>
                    <td className="px-4 py-4"><StockPostingBadge status={invoice.stockPostingStatus || "Not Posted"} /></td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setSelectedInvoiceId(invoice.id)} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-800">View</button>
                        {invoice.status === "Draft" && canApprove ? <button onClick={() => updateInvoiceStatus(invoice.id, "Approved")} className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-800">Approve</button> : null}
                        {invoice.status === "Approved" && canEmail ? (
                          <a onClick={() => updateInvoiceStatus(invoice.id, "Sent")} href={emailHref(invoice)} className="inline-flex items-center gap-1 rounded-xl bg-purple-50 px-3 py-2 text-xs font-black text-purple-800">
                            <Mail size={13} />
                            Email
                          </a>
                        ) : null}
                        {invoice.status === "Sent" && canEdit ? <button onClick={() => updateInvoiceStatus(invoice.id, "Paid")} className="rounded-xl border border-[#A3E635]/20 bg-[#A3E635]/10 px-3 py-2 text-xs font-black text-[#4D7C0F]">Paid</button> : null}
                        {invoice.status !== "Paid" && invoice.status !== "Cancelled" && canEdit ? <button onClick={() => updateInvoiceStatus(invoice.id, "Cancelled")} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Cancel</button> : null}
                        {canDelete ? <button onClick={() => deleteInvoice(invoice.id)} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">Delete</button> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
                    Loading invoices…
                  </td>
                </tr>
              ) : null}
              {!loading && invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
                    No invoices captured yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedInvoice ? (
        <section className="rounded-[32px] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">Invoice Preview</p>
              <h2 className="mt-1 text-3xl font-black text-slate-950">{selectedInvoice.invoiceNumber}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{selectedInvoice.customerName}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StockPostingBadge status={selectedInvoice.stockPostingStatus || "Not Posted"} />
                {invoiceHasUnlinkedStock(selectedInvoice) ? (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                    Warning: one or more lines have no stock item linked
                  </span>
                ) : null}
              </div>
              {stockMessage ? (
                <p className="mt-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-900">
                  {stockMessage}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {!demoMode && canApprove && selectedInvoice.stockPostingStatus !== "Posted" && selectedInvoice.stockPostingStatus !== "Reversed" ? (
                <button
                  type="button"
                  disabled={stockBusy}
                  onClick={() => void postInvoiceStock(selectedInvoice, false)}
                  className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-[#F8FAFC] disabled:opacity-60"
                >
                  Post Stock
                </button>
              ) : null}
              {!demoMode && canApprove && canPostAdjustment && selectedInvoice.stockPostingStatus !== "Posted" && selectedInvoice.stockPostingStatus !== "Reversed" ? (
                <button
                  type="button"
                  disabled={stockBusy}
                  onClick={() => {
                    if (!confirm("Post stock with insufficient-stock override?")) return;
                    void postInvoiceStock(selectedInvoice, true);
                  }}
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-black text-amber-800 disabled:opacity-60"
                >
                  Post Stock (Override)
                </button>
              ) : null}
              {!demoMode && canApprove && selectedInvoice.stockPostingStatus === "Posted" ? (
                <button
                  type="button"
                  disabled={stockBusy}
                  onClick={() => void reverseInvoiceStock(selectedInvoice)}
                  className="rounded-2xl bg-rose-50 px-5 py-3 text-sm font-black text-rose-700 disabled:opacity-60"
                >
                  Reverse Stock
                </button>
              ) : null}
              {selectedInvoice.status === "Draft" && canApprove ? (
                <button onClick={() => updateInvoiceStatus(selectedInvoice.id, "Approved")} className="rounded-2xl bg-indigo-50 px-5 py-3 text-sm font-black text-indigo-800">
                  Approve
                </button>
              ) : null}
              {selectedInvoice.status === "Approved" && canEmail ? (
                <a
                  onClick={() => updateInvoiceStatus(selectedInvoice.id, "Sent")}
                  href={emailHref(selectedInvoice)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-purple-50 px-5 py-3 text-sm font-black text-purple-800"
                >
                  <Mail size={17} />
                  Email
                </a>
              ) : null}
              {selectedInvoice.status === "Sent" && canEdit ? (
                <button onClick={() => updateInvoiceStatus(selectedInvoice.id, "Paid")} className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 px-5 py-3 text-sm font-black text-[#4D7C0F]">
                  Mark Paid
                </button>
              ) : null}
              {selectedInvoice.status !== "Paid" && selectedInvoice.status !== "Cancelled" && canEdit ? (
                <button onClick={() => updateInvoiceStatus(selectedInvoice.id, "Cancelled")} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
                  Cancel
                </button>
              ) : null}
              {canDelete ? (
                <button onClick={() => deleteInvoice(selectedInvoice.id)} className="rounded-2xl bg-rose-50 px-5 py-3 text-sm font-black text-rose-700">
                  <Trash2 size={17} />
                  Delete
                </button>
              ) : null}
              <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-white px-5 py-3 text-sm font-black text-violet-800">
                <Printer size={17} />
                Print
              </button>
              <button onClick={() => setSelectedInvoiceId(null)} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Close</button>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-[24px] border border-violet-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-violet-50 text-xs font-black uppercase tracking-[0.12em] text-violet-800">
                <tr>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Unit Excl</th>
                  <th className="px-4 py-3 text-right">VAT</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedInvoice.lines.map((line) => {
                  const t = lineTotals(line);
                  return (
                    <tr key={line.id} className="border-t border-violet-50">
                      <td className="px-4 py-3 font-bold">{line.description}</td>
                      <td className="px-4 py-3 text-right font-bold">{line.qty}</td>
                      <td className="px-4 py-3 text-right font-bold">{money(line.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-bold">{money(t.vat)}</td>
                      <td className="px-4 py-3 text-right font-black">{money(t.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
    </VyronPremiumPageShell>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_16px_50px_rgba(76,29,149,0.08)]">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">{title}</p>
      <p className="mt-3 truncate text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  onFocus,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  type?: string;
}) {
  return (
    <label>
      <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-violet-400"
      />
    </label>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-violet-400"
      />
    </label>
  );
}

function PickerBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-0 right-0 z-50 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-violet-100 bg-white shadow-2xl shadow-violet-500/10">
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const classes: Record<InvoiceStatus, string> = {
    Draft: "bg-amber-100 text-amber-800",
    Approved: "bg-indigo-100 text-indigo-800",
    Posted: "bg-sky-100 text-sky-800",
    Sent: "bg-purple-100 text-purple-800",
    Paid: "bg-[#A3E635]/12 text-[#4D7C0F]",
    Cancelled: "bg-slate-200 text-slate-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${classes[status] || classes.Draft}`}>{status}</span>;
}

function StockPostingBadge({ status }: { status: InvoiceStockPostingStatus }) {
  const classes: Record<InvoiceStockPostingStatus, string> = {
    "Not Posted": "bg-slate-100 text-slate-700",
    Posted: "bg-[#A3E635]/12 text-[#4D7C0F]",
    Reversed: "bg-rose-100 text-rose-700",
  };
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${classes[status]}`}>{status}</span>;
}
