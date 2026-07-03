"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, PackageCheck, Plus, Send, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { useInvoicePermissions, useSalesOrderPermissions } from "@/hooks/useModulePermissions";

type SalesOrderStatus =
  | "Draft"
  | "Awaiting Approval"
  | "Approved"
  | "Picking"
  | "Packed"
  | "Dispatched"
  | "Partially Invoiced"
  | "Invoiced"
  | "Cancelled";

type SalesOrder = {
  id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string;
  delivery_address: string | null;
  contact_name: string | null;
  salesperson: string | null;
  warehouse: string | null;
  status: SalesOrderStatus;
  requested_delivery_date: string | null;
  notes: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  cost_value: number;
  gross_profit: number;
  gp_percentage: number;
  created_at: string;
  requires_approval?: boolean;
  approval_flags?: Array<{ code: string; message: string; severity: string }>;
};

type SalesOrderLine = {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  selling_price: number;
  discount_pct: number;
  tax_rate: number;
  line_total: number;
  cost_per_unit: number;
};

type SalesOrderInsight = {
  order: SalesOrder;
  lines: SalesOrderLine[];
  picking_list: Array<{
    sales_order_line_id: string;
    description: string;
    required_qty: number;
    available_qty: number;
    shortfall_qty: number;
    unit: string;
    pick_status: "Ready" | "Short";
  }>;
  shortages: Array<{
    product_id: string;
    product_name: string;
    required_qty: number;
    available_qty: number;
    shortfall_qty: number;
    unit: string;
    linked_bom_id: string | null;
  }>;
  manufacturing: {
    stockAvailable: boolean;
    insufficientStock: boolean;
    canManufacture: boolean;
    ingredientsAvailablePct: number;
    estimatedProductionHours: number;
    estimatedManufactureCost: number;
  };
  procurement: {
    missingIngredients: Array<{
      ingredient_id: string | null;
      ingredient_name: string;
      required_qty: number;
      available_qty: number;
      shortage_qty: number;
      unit: string;
      estimated_cost: number;
      supplier_name: string | null;
      supplier_price: number | null;
      lead_time_days: number | null;
    }>;
    estimatedCost: number;
  };
  ai: {
    recommendations: Array<{ label: string; level: "good" | "warning" | "critical" }>;
    expectedProfit: number;
    confidence: number;
  };
  timeline: Array<{
    key: string;
    label: string;
    timestamp: string | null;
    actor: string | null;
    completed: boolean;
  }>;
  traceability: Array<{
    key: string;
    label: string;
    href: string | null;
    reference: string | null;
    status: "linked" | "pending";
  }>;
  approval_rules: Array<{ code: string; message: string; severity: string }>;
  requires_approval: boolean;
  audits: Array<{
    id: string;
    event_type: string;
    actor: string | null;
    from_status: string | null;
    to_status: string | null;
    detail: string | null;
    created_at: string;
  }>;
};

type CustomerOption = {
  id: string;
  customer_name: string;
  email?: string | null;
  invoice_email?: string | null;
};

type ProductOption = {
  id: string;
  product_name: string;
  sku?: string | null;
  selling_price?: number;
  total_cost?: number;
};

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(value || 0));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine(): SalesOrderLine {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    product_id: null,
    description: "",
    quantity: 1,
    unit: "each",
    selling_price: 0,
    discount_pct: 0,
    tax_rate: 15,
    line_total: 0,
    cost_per_unit: 0,
  };
}

export default function CustomerSalesOrdersClient({
  initialCustomerId,
  initialCreateOpen,
}: {
  initialCustomerId: string | null;
  initialCreateOpen: boolean;
}) {
  const salesPermissions = useSalesOrderPermissions();
  const invoicePermissions = useInvoicePermissions();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [kpis, setKpis] = useState({
    draftOrders: 0,
    awaitingApproval: 0,
    readyToPick: 0,
    waitingForDispatch: 0,
    readyToInvoice: 0,
    ordersToday: 0,
    revenueToday: 0,
    gpToday: 0,
    manufacturingRequired: 0,
    procurementRequired: 0,
  });
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrderInsight | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState(initialCustomerId || "");
  const [customerName, setCustomerName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<SalesOrderLine[]>([emptyLine()]);

  const liveTotals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => {
      const qty = Number(line.quantity || 0);
      const price = Number(line.selling_price || 0);
      const discount = Number(line.discount_pct || 0);
      return sum + qty * price * (1 - discount / 100);
    }, 0);
    const vat = lines.reduce((sum, line) => {
      const qty = Number(line.quantity || 0);
      const price = Number(line.selling_price || 0);
      const discount = Number(line.discount_pct || 0);
      const net = qty * price * (1 - discount / 100);
      return sum + net * (Number(line.tax_rate || 15) / 100);
    }, 0);
    const cost = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.cost_per_unit || 0), 0);
    const gp = subtotal - cost;
    return {
      subtotal,
      vat,
      total: subtotal + vat,
      cost,
      gp,
      gpPct: subtotal > 0 ? (gp / subtotal) * 100 : 0,
    };
  }, [lines]);

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  async function loadOrders() {
    const params = new URLSearchParams();
    if (statusFilter !== "All") params.set("status", statusFilter);
    if (search.trim()) params.set("search", search.trim());
    if (initialCustomerId) params.set("customerId", initialCustomerId);
    const res = await fetch(`/api/customer-sales-orders?${params.toString()}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Could not load sales orders.");
    setOrders(Array.isArray(data.orders) ? data.orders : []);
    if (data.kpis) setKpis(data.kpis);
  }

  async function loadCustomers() {
    const res = await fetch("/api/customers");
    const data = await res.json();
    if (!data.ok) return;
    setCustomers(Array.isArray(data.customers) ? data.customers : []);
  }

  async function loadProducts() {
    const res = await fetch("/api/products");
    const data = await res.json();
    if (!data.ok) return;
    setProducts(Array.isArray(data.products) ? data.products : []);
  }

  useEffect(() => {
    async function run() {
      setLoading(true);
      try {
        await Promise.all([loadOrders(), loadCustomers(), loadProducts()]);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Load failed.");
      } finally {
        setLoading(false);
      }
    }
    void run();
  }, [statusFilter, search, initialCustomerId]);

  useEffect(() => {
    if (!customerId) return;
    const selected = customerMap.get(customerId);
    if (selected) setCustomerName(selected.customer_name);
  }, [customerId, customerMap]);

  function setLine(index: number, patch: Partial<SalesOrderLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function saveOrder() {
    if (!salesPermissions.canCreate) {
      setMessage("You do not have permission to create sales orders.");
      return;
    }
    if (!customerName.trim()) {
      setMessage("Customer is required.");
      return;
    }
    if (!lines.length || lines.every((line) => !line.description.trim())) {
      setMessage("At least one line is required.");
      return;
    }

    const payload = {
      customerId: customerId || null,
      customerName: customerName.trim(),
      deliveryAddress,
      contactName,
      salesperson,
      warehouse,
      requestedDeliveryDate,
      notes,
      lines: lines
        .filter((line) => line.description.trim())
        .map((line) => ({
          productId: line.product_id,
          description: line.description,
          quantity: Number(line.quantity || 0),
          unit: line.unit || "each",
          sellingPrice: Number(line.selling_price || 0),
          discountPct: Number(line.discount_pct || 0),
          taxRate: Number(line.tax_rate || 15),
          costPerUnit: Number(line.cost_per_unit || 0),
        })),
    };

    const res = await fetch("/api/customer-sales-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) {
      setMessage(data.error || "Save failed.");
      return;
    }

    setMessage(`Sales order ${data.order.order_number} created.`);
    setCreateOpen(false);
    setLines([emptyLine()]);
    setDeliveryAddress("");
    setContactName("");
    setSalesperson("");
    setWarehouse("");
    setNotes("");
    await loadOrders();
  }

  async function runAction(orderId: string, action: "submit" | "approve" | "start_picking" | "pack" | "dispatch" | "cancel") {
    setBusyOrderId(orderId);
    const res = await fetch(`/api/customer-sales-orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, actor: "user" }),
    });
    const data = await res.json();
    if (!data.ok) {
      if (Array.isArray(data.shortages) && data.shortages.length) {
        setMessage(`${data.error || "Update failed."} Create production run or requisition from shortages.`);
      } else {
        setMessage(data.error || "Update failed.");
      }
      setBusyOrderId(null);
      return;
    }
    setMessage(`Order ${data.order.order_number} moved to ${data.order.status}.`);
    await loadOrders();
    if (selectedOrder?.order.id === orderId) await loadInsight(orderId);
    setBusyOrderId(null);
  }

  async function convertToInvoice(orderId: string) {
    if (!invoicePermissions.canCreate) {
      setMessage("You do not have permission to create invoices.");
      return;
    }

    const res = await fetch(`/api/customer-sales-orders/${orderId}/convert-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: "user" }),
    });
    const data = await res.json();
    if (!data.ok) {
      setMessage(data.error || "Conversion failed.");
      return;
    }

    setMessage(`Converted to invoice ${data.invoice.invoice_number}.`);
    await loadOrders();
    if (selectedOrder?.order.id === orderId) await loadInsight(orderId);
  }

  async function loadInsight(orderId: string) {
    const res = await fetch(`/api/customer-sales-orders/${orderId}`);
    const data = await res.json();
    if (!data.ok) {
      setMessage(data.error || "Could not load sales order detail.");
      return;
    }
    setSelectedOrder(data as SalesOrderInsight);
  }

  async function createProductionRun(orderId: string) {
    setBusyOrderId(orderId);
    const res = await fetch(`/api/customer-sales-orders/${orderId}/create-production-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: "user" }),
    });
    const data = await res.json();
    if (!data.ok) {
      setBusyOrderId(null);
      setMessage(data.error || "Could not create production run.");
      return;
    }
    setMessage(`Created ${Array.isArray(data.runs) ? data.runs.length : 0} production run(s).`);
    await loadInsight(orderId);
    setBusyOrderId(null);
  }

  async function createRequisition(orderId: string) {
    setBusyOrderId(orderId);
    const res = await fetch(`/api/customer-sales-orders/${orderId}/generate-requisition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: "user" }),
    });
    const data = await res.json();
    if (!data.ok) {
      setBusyOrderId(null);
      setMessage(data.error || "Could not generate requisition.");
      return;
    }
    setMessage(`Generated requisition ${data.requisition?.requisition_number || ""}.`);
    await loadInsight(orderId);
    setBusyOrderId(null);
  }

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6 overflow-x-hidden">
      <section className="grid w-full max-w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 min-[2200px]:grid-cols-8">
        <KpiCard label="Draft Orders" value={String(kpis.draftOrders)} />
        <KpiCard label="Awaiting Approval" value={String(kpis.awaitingApproval)} />
        <KpiCard label="Waiting for Picking" value={String(kpis.readyToPick)} />
        <KpiCard label="Waiting for Dispatch" value={String(kpis.waitingForDispatch)} />
        <KpiCard label="Waiting for Invoice" value={String(kpis.readyToInvoice)} />
        <KpiCard label="Orders Today" value={String(kpis.ordersToday)} />
        <KpiCard label="Revenue Today" value={money(kpis.revenueToday)} />
        <KpiCard label="GP Today" value={money(kpis.gpToday)} />
        <KpiCard label="Manufacturing Required" value={String(kpis.manufacturingRequired)} />
        <KpiCard label="Procurement Required" value={String(kpis.procurementRequired)} />
      </section>

      <section className="w-full max-w-full min-w-0 overflow-x-hidden rounded-3xl bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, order number, salesperson..."
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none sm:min-w-[260px]"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold"
          >
            {["All", "Draft", "Awaiting Approval", "Approved", "Picking", "Packed", "Dispatched", "Partially Invoiced", "Invoiced", "Cancelled"].map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          {salesPermissions.canCreate ? (
            <button
              type="button"
              onClick={() => setCreateOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white"
            >
              <Plus size={16} /> New Sales Order
            </button>
          ) : null}
        </div>

        {createOpen ? (
          <div className="mt-5 w-full max-w-full min-w-0 rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
            <h3 className="text-lg font-black text-slate-900">Create Sales Order</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Customer
                <select
                  value={customerId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setCustomerId(id);
                    const selected = customerMap.get(id);
                    if (selected) setCustomerName(selected.customer_name);
                  }}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold"
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.customer_name}</option>
                  ))}
                </select>
              </label>
              <Field label="Delivery Address" value={deliveryAddress} onChange={setDeliveryAddress} />
              <Field label="Contact" value={contactName} onChange={setContactName} />
              <Field label="Salesperson" value={salesperson} onChange={setSalesperson} />
              <Field label="Warehouse" value={warehouse} onChange={setWarehouse} />
              <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Requested Delivery Date
                <input
                  type="date"
                  value={requestedDeliveryDate}
                  onChange={(event) => setRequestedDeliveryDate(event.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold"
                />
              </label>
            </div>

            <div className="mt-4 w-full max-w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Order Lines</div>
              <div className="grid gap-2">
                {lines.map((line, index) => (
                  <div key={line.id} className="grid min-w-0 gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[1.2fr_1.8fr_0.7fr_0.7fr_0.8fr_0.8fr_0.8fr_auto]">
                    <select
                      value={line.product_id || ""}
                      onChange={(event) => {
                        const product = products.find((row) => row.id === event.target.value);
                        setLine(index, {
                          product_id: event.target.value || null,
                          description: product?.product_name || line.description,
                          selling_price: Number(product?.selling_price || line.selling_price),
                          cost_per_unit: Number(product?.total_cost || line.cost_per_unit),
                        });
                      }}
                      className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    >
                      <option value="">Product</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.product_name}</option>
                      ))}
                    </select>
                    <input value={line.description} onChange={(event) => setLine(index, { description: event.target.value })} placeholder="Description" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    <input type="number" value={line.quantity} onChange={(event) => setLine(index, { quantity: Number(event.target.value || 0) })} placeholder="Qty" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    <input value={line.unit} onChange={(event) => setLine(index, { unit: event.target.value })} placeholder="Unit" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    <input type="number" value={line.selling_price} onChange={(event) => setLine(index, { selling_price: Number(event.target.value || 0) })} placeholder="Price" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    <input type="number" value={line.discount_pct} onChange={(event) => setLine(index, { discount_pct: Number(event.target.value || 0) })} placeholder="Discount %" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    <input type="number" value={line.tax_rate} onChange={(event) => setLine(index, { tax_rate: Number(event.target.value || 0) })} placeholder="Tax %" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    <button type="button" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">Remove</button>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Add Line</button>
                <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm sm:min-w-[280px]" />
                <button type="button" onClick={() => void saveOrder()} className="rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-black text-white">Save Draft</button>
              </div>

              <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700 md:grid-cols-6">
                <div><span className="text-slate-500">Subtotal</span><div className="mt-1 text-sm text-slate-900">{money(liveTotals.subtotal)}</div></div>
                <div><span className="text-slate-500">VAT</span><div className="mt-1 text-sm text-slate-900">{money(liveTotals.vat)}</div></div>
                <div><span className="text-slate-500">Total</span><div className="mt-1 text-sm text-slate-900">{money(liveTotals.total)}</div></div>
                <div><span className="text-slate-500">Cost</span><div className="mt-1 text-sm text-slate-900">{money(liveTotals.cost)}</div></div>
                <div><span className="text-slate-500">Gross Profit</span><div className="mt-1 text-sm text-slate-900">{money(liveTotals.gp)}</div></div>
                <div><span className="text-slate-500">Margin %</span><div className={`mt-1 text-sm ${liveTotals.gpPct < 30 ? "text-amber-700" : "text-emerald-700"}`}>{liveTotals.gpPct.toFixed(2)}%</div></div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-5 w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-100">
          <div className="min-w-[1080px] max-w-none">
            <div className="grid min-w-0 grid-cols-[0.8fr_1.1fr_0.9fr_0.8fr_0.8fr_0.8fr_1.2fr] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
              <div>Order</div><div>Customer</div><div>Status</div><div>Total</div><div>Requested</div><div>GP</div><div>Workflow</div>
            </div>
            {loading ? <div className="px-4 py-6 text-sm font-semibold text-slate-500">Loading sales orders...</div> : null}
            {!loading && orders.length === 0 ? <div className="px-4 py-6 text-sm font-semibold text-slate-500">No sales orders found.</div> : null}

            {orders.map((order) => (
              <div key={order.id} className="grid min-w-0 grid-cols-[0.8fr_1.1fr_0.9fr_0.8fr_0.8fr_0.8fr_1.2fr] items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm">
                <div className="font-black text-violet-700">{order.order_number}</div>
                <div>
                  <div className="font-bold text-slate-900">{order.customer_name}</div>
                  <div className="text-xs font-semibold text-slate-500">{order.salesperson || "No salesperson"}</div>
                </div>
                <div><StatusPill status={order.status} /></div>
                <div className="font-bold text-slate-900">{money(order.total)}</div>
                <div className="font-semibold text-slate-600">{order.requested_delivery_date || "-"}</div>
                <div className={`font-bold ${Number(order.gp_percentage || 0) < 30 ? "text-amber-700" : "text-emerald-700"}`}>{Number(order.gp_percentage || 0).toFixed(1)}%</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void loadInsight(order.id)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700">Detail</button>
                  {order.status === "Draft" ? <ActionButton icon={<ClipboardCheck size={14} />} label="Submit" onClick={() => void runAction(order.id, "submit")} /> : null}
                  {order.status === "Awaiting Approval" ? <ActionButton icon={<CheckCircle2 size={14} />} label="Approve" onClick={() => void runAction(order.id, "approve")} /> : null}
                  {order.status === "Approved" ? <ActionButton icon={<PackageCheck size={14} />} label="Start Pick" onClick={() => void runAction(order.id, "start_picking")} /> : null}
                  {order.status === "Picking" ? <ActionButton icon={<PackageCheck size={14} />} label="Pack" onClick={() => void runAction(order.id, "pack")} /> : null}
                  {order.status === "Packed" ? <ActionButton icon={<Truck size={14} />} label="Dispatch" onClick={() => void runAction(order.id, "dispatch")} /> : null}
                  {(order.status === "Dispatched" || order.status === "Partially Invoiced") ? (
                    <ActionButton icon={<Send size={14} />} label="Convert to Invoice" onClick={() => void convertToInvoice(order.id)} />
                  ) : null}
                  {(order.status === "Draft" || order.status === "Awaiting Approval" || order.status === "Approved") ? (
                    <button type="button" onClick={() => void runAction(order.id, "cancel")} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700">Cancel</button>
                  ) : null}
                  {order.status === "Invoiced" ? <Link href="/customer-invoices" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">View Invoice</Link> : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedOrder ? (
          <div className="mt-5 w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-black text-slate-900">Sales Order Detail: {selectedOrder.order.order_number}</h3>
              <button type="button" onClick={() => setSelectedOrder(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700">Close</button>
            </div>

            {selectedOrder.approval_rules.length ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs font-black uppercase tracking-[0.12em] text-amber-800">Automatic Approval Rules</div>
                <div className="mt-2 grid gap-2">
                  {selectedOrder.approval_rules.map((rule, index) => (
                    <div key={`${rule.code}-${index}`} className="text-sm font-semibold text-amber-900">{rule.code}: {rule.message}</div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-800">Manufacturing Intelligence</div>
              <div className="mt-2 grid gap-2 text-sm font-semibold text-emerald-900 sm:grid-cols-2 xl:grid-cols-6">
                <div>{selectedOrder.manufacturing.stockAvailable ? "Stock Available" : "Stock Not Fully Available"}</div>
                <div>{selectedOrder.manufacturing.insufficientStock ? "Insufficient Stock" : "Sufficient Stock"}</div>
                <div>{selectedOrder.manufacturing.canManufacture ? "Can Manufacture" : "Cannot Manufacture"}</div>
                <div>Ingredients Available {selectedOrder.manufacturing.ingredientsAvailablePct.toFixed(1)}%</div>
                <div>Production Time {selectedOrder.manufacturing.estimatedProductionHours.toFixed(2)}h</div>
                <div>Manufacture Cost {money(selectedOrder.manufacturing.estimatedManufactureCost)}</div>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  disabled={busyOrderId === selectedOrder.order.id}
                  onClick={() => void createProductionRun(selectedOrder.order.id)}
                  className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-black text-white disabled:opacity-60"
                >
                  Create Production Run
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Picking List</div>
              <div className="mt-2 overflow-x-auto">
                <div className="min-w-[760px] grid gap-2">
                  {selectedOrder.picking_list.map((line) => (
                    <div key={line.sales_order_line_id} className="grid grid-cols-[1.6fr_0.6fr_0.6fr_0.6fr_0.5fr] gap-2 text-sm font-semibold">
                      <div className="text-slate-800">{line.description}</div>
                      <div className="text-slate-700">Req {line.required_qty.toFixed(2)}</div>
                      <div className="text-slate-700">Avail {line.available_qty.toFixed(2)}</div>
                      <div className={line.shortfall_qty > 0 ? "text-rose-700" : "text-emerald-700"}>Short {line.shortfall_qty.toFixed(2)}</div>
                      <div className={line.pick_status === "Short" ? "text-rose-700" : "text-emerald-700"}>{line.pick_status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-sky-700">Procurement Intelligence</div>
              {!selectedOrder.procurement.missingIngredients.length ? (
                <div className="mt-2 text-sm font-semibold text-sky-900">No missing ingredients detected for current shortages.</div>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <div className="min-w-[920px] grid gap-2">
                    <div className="grid grid-cols-[1.4fr_1fr_0.9fr_0.8fr_0.9fr] gap-2 text-[11px] font-black uppercase tracking-[0.1em] text-sky-700">
                      <div>Missing Ingredients</div><div>Supplier</div><div>Supplier Price</div><div>Lead Time</div><div>Estimated Cost</div>
                    </div>
                    {selectedOrder.procurement.missingIngredients.map((row, index) => (
                      <div key={`${row.ingredient_id || row.ingredient_name}-${index}`} className="grid grid-cols-[1.4fr_1fr_0.9fr_0.8fr_0.9fr] gap-2 text-sm font-semibold text-sky-900">
                        <div>{row.ingredient_name} (short {row.shortage_qty.toFixed(2)} {row.unit})</div>
                        <div>{row.supplier_name || "No supplier"}</div>
                        <div>{row.supplier_price != null ? money(row.supplier_price) : "-"}</div>
                        <div>{row.lead_time_days != null ? `${row.lead_time_days} days` : "-"}</div>
                        <div>{money(row.estimated_cost)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="text-sm font-black text-sky-800">Estimated Procurement Cost: {money(selectedOrder.procurement.estimatedCost)}</div>
                <button
                  type="button"
                  disabled={busyOrderId === selectedOrder.order.id}
                  onClick={() => void createRequisition(selectedOrder.order.id)}
                  className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-800 disabled:opacity-60"
                >
                  Generate Purchase Requisition
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-violet-800">AI Commercial Intelligence</div>
              <div className="mt-2 grid gap-2 text-sm font-semibold text-violet-900">
                {selectedOrder.ai.recommendations.map((item, index) => (
                  <div key={`${item.label}-${index}`}>
                    {item.level === "good" ? "✔" : item.level === "warning" ? "⚠" : "✖"} {item.label}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-black text-violet-900">
                <div>Expected Profit: {money(selectedOrder.ai.expectedProfit)}</div>
                <div>Confidence: {selectedOrder.ai.confidence}%</div>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Workflow Timeline</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {selectedOrder.timeline.map((step) => (
                  <div key={step.key} className={`rounded-lg border p-2 ${step.completed ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                    <div className="text-xs font-black text-slate-700">{step.label}</div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-600">{step.timestamp ? new Date(step.timestamp).toLocaleString("en-ZA") : "Pending"}</div>
                    <div className="text-[11px] font-semibold text-slate-500">{step.actor || "-"}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Document Traceability</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-black text-slate-700">
                {selectedOrder.traceability.map((item, index) => (
                  <div key={item.key} className="inline-flex items-center gap-2">
                    {item.href ? (
                      <Link href={item.href} className={`rounded-full px-3 py-1 ${item.status === "linked" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                        {item.label}{item.reference ? ` (${item.reference})` : ""}
                      </Link>
                    ) : (
                      <span className={`rounded-full px-3 py-1 ${item.status === "linked" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                        {item.label}{item.reference ? ` (${item.reference})` : ""}
                      </span>
                    )}
                    {index < selectedOrder.traceability.length - 1 ? <span>↓</span> : null}
                  </div>
                ))}
              </div>
            </div>

            {selectedOrder.audits.length ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Audit Trail</div>
                <div className="mt-2 grid gap-2 text-sm font-semibold text-slate-700">
                  {selectedOrder.audits.slice(0, 12).map((audit) => (
                    <div key={audit.id}>
                      {new Date(audit.created_at).toLocaleString("en-ZA")} • {audit.event_type} • {audit.from_status || "-"} → {audit.to_status || "-"} • {audit.detail || "No detail"}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {message ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">{message}</div> : null}
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="h-full w-full max-w-full min-w-0 rounded-2xl bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.08)]">
      <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</div>
      <div className="mt-2 break-words text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold" />
    </label>
  );
}

function ActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-black text-white">
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ status }: { status: SalesOrderStatus }) {
  const tone =
    status === "Invoiced"
      ? "bg-emerald-100 text-emerald-800"
      : status === "Cancelled"
        ? "bg-rose-100 text-rose-800"
        : status === "Awaiting Approval"
          ? "bg-amber-100 text-amber-800"
          : status === "Dispatched"
            ? "bg-sky-100 text-sky-800"
            : "bg-violet-100 text-violet-800";

  return <span className={`rounded-full px-3 py-1 text-xs font-black ${tone}`}>{status}</span>;
}
