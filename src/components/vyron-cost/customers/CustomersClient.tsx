"use client";

import { Search, Users, Mail, Phone, FileText, Percent, Trash2, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readCustomerHistoryLocally } from "@/lib/vyron-cost/customer-invoice-flow";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { useInvoicePermissions, useModulePermissions } from "@/hooks/useModulePermissions";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

type Customer = {
  id: string;
  name: string;
  category: string;
  contactEmail: string;
  invoiceEmail: string;
  phone: string;
  terms: string;
  vatNumber: string;
  status: string;
  revenue: number;
  gpMovement: number;
  outstandingOrders: number;
  outstandingInvoices: number;
  averagePaymentDays: number;
  lifetimeValue: number;
  onHold: boolean;
};

type SeedCustomer = Omit<
  Customer,
  "outstandingOrders" | "outstandingInvoices" | "averagePaymentDays" | "lifetimeValue" | "onHold"
>;

const initialCustomers: Customer[] = ([
  { id: "CUST-001", name: "Local Café Group", category: "Hospitality Group", contactEmail: "manager@localcafegroup.co.za", invoiceEmail: "accounts@localcafegroup.co.za", phone: "021 555 0148", terms: "7 Days", vatNumber: "4890123456", status: "Active", revenue: 128500, gpMovement: 42.3 },
  { id: "CUST-002", name: "Farmstall Foods", category: "Retail / Farmstall", contactEmail: "buyer@farmstallfoods.co.za", invoiceEmail: "orders@farmstallfoods.co.za", phone: "021 555 0191", terms: "14 Days", vatNumber: "4120987654", status: "Active", revenue: 94200, gpMovement: 38.5 },
  { id: "CUST-003", name: "Corporate Canteen Supplies", category: "Corporate Catering", contactEmail: "procurement@corporatecanteens.co.za", invoiceEmail: "finance@corporatecanteens.co.za", phone: "011 555 0188", terms: "30 Days", vatNumber: "4678901234", status: "Active", revenue: 76800, gpMovement: 45.1 },
  { id: "CUST-004", name: "School Tuckshop Network", category: "Schools", contactEmail: "admin@schooltuckshops.co.za", invoiceEmail: "admin@schooltuckshops.co.za", phone: "010 555 0144", terms: "COD", vatNumber: "N/A", status: "Active", revenue: 55200, gpMovement: 39.2 },
  { id: "CUST-005", name: "Cape Deli Distribution", category: "Distributor", contactEmail: "orders@capedeli.co.za", invoiceEmail: "accounts@capedeli.co.za", phone: "021 555 0112", terms: "30 Days", vatNumber: "4215678901", status: "Review", revenue: 68400, gpMovement: 36.4 },
  { id: "CUST-006", name: "Winelands Coffee Stops", category: "Hospitality", contactEmail: "ops@winelandscoffee.co.za", invoiceEmail: "finance@winelandscoffee.co.za", phone: "021 555 0180", terms: "14 Days", vatNumber: "4556789012", status: "Active", revenue: 49600, gpMovement: 41.8 },
  { id: "CUST-007", name: "Factory Canteen Group", category: "Industrial Catering", contactEmail: "orders@factorycanteens.co.za", invoiceEmail: "accounts@factorycanteens.co.za", phone: "011 555 0166", terms: "30 Days", vatNumber: "4789012345", status: "Watch", revenue: 73200, gpMovement: 35.9 },
  { id: "CUST-008", name: "Northern Suburbs Grocers", category: "Retail", contactEmail: "buying@nsgrocers.co.za", invoiceEmail: "accounts@nsgrocers.co.za", phone: "021 555 0160", terms: "21 Days", vatNumber: "4987654321", status: "Active", revenue: 58800, gpMovement: 40.2 },
] as SeedCustomer[]).map((customer) => ({
  ...customer,
  outstandingOrders: 0,
  outstandingInvoices: 0,
  averagePaymentDays: 0,
  lifetimeValue: customer.revenue,
  onHold: false,
}));

function customerStorageKey(workspaceId: string | null) {
  return workspaceId ? `vyron-cost-customers:${workspaceId}` : "vyron-cost-customers";
}

function mapApiCustomer(row: Record<string, unknown>): Customer {
  const sales = Number(row.total_sales || 0);
  const avg = Number(row.average_invoice_value || 0);
  const gpMovement = sales > 0 && avg > 0 ? Math.min(99, Math.max(0, (avg / sales) * 100)) : 0;
  return {
    id: String(row.id),
    name: String(row.customer_name || ""),
    category: String(row.category || row.contact_person || "Customer"),
    contactEmail: String(row.email || ""),
    invoiceEmail: String(row.invoice_email || row.email || ""),
    phone: String(row.phone || ""),
    terms: String(row.terms || "30 Days"),
    vatNumber: String(row.vat_number || "N/A"),
    status: String(row.status || (row.active === false ? "Inactive" : "Active")),
    revenue: sales,
    gpMovement,
    outstandingOrders: Number(row.outstanding_orders || 0),
    outstandingInvoices: Number(row.outstanding_invoices || 0),
    averagePaymentDays: Number(row.average_payment_days || 0),
    lifetimeValue: Number(row.lifetime_value || sales),
    onHold: Boolean(row.on_hold),
  };
}

export default function CustomersClient() {
  const { canCreate, canEdit, canDelete } = useModulePermissions("customers");
  const { canCreate: canCreateInvoice } = useInvoicePermissions();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = readActiveClient();
    const demo = isDemoWorkspace(client);
    setDemoMode(demo);

    async function loadCustomers() {
      if (!demo) {
        try {
          const response = await fetch("/api/customers");
          const data = await response.json();
          if (data.ok && Array.isArray(data.customers)) {
            setCustomers(data.customers.map((row: Record<string, unknown>) => mapApiCustomer(row)));
            return;
          }
        } catch {
          // fall through to empty
        }
        setCustomers([]);
        return;
      }

      const key = customerStorageKey(client?.id ?? null);
      const raw = window.localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Customer[];
          if (Array.isArray(parsed)) {
            setCustomers(parsed);
            return;
          }
        } catch {
          // fall through
        }
      }
      setCustomers(initialCustomers);
    }

    loadCustomers().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!demoMode) return;
    const client = readActiveClient();
    const key = customerStorageKey(client?.id ?? null);
    window.localStorage.setItem(key, JSON.stringify(customers));
  }, [customers, demoMode]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    category: "Customer",
    contactEmail: "",
    invoiceEmail: "",
    phone: "",
    terms: "30 Days",
    vatNumber: "",
    status: "Active",
  });

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.category, customer.contactEmail, customer.invoiceEmail, customer.terms, customer.status]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [customers, search]);

  async function addCustomer() {
    if (!canCreate) {
      alert("You do not have permission to create customers.");
      return;
    }
    if (!form.name.trim()) {
      alert("Please enter a customer name.");
      return;
    }

    if (!demoMode) {
      try {
        const response = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerName: form.name.trim(),
            category: form.category.trim() || "Customer",
            contactEmail: form.contactEmail.trim(),
            invoiceEmail: form.invoiceEmail.trim() || form.contactEmail.trim(),
            phone: form.phone.trim(),
            terms: form.terms.trim() || "30 Days",
            vatNumber: form.vatNumber.trim() || "N/A",
            status: form.status.trim() || "Active",
          }),
        });
        const data = await response.json();
        if (!data.ok) {
          alert(data.error || "Failed to save customer.");
          return;
        }
        setCustomers((current) => [mapApiCustomer(data.customer), ...current]);
      } catch {
        alert("Failed to save customer.");
        return;
      }
    } else {
      const next: Customer = {
        id: `CUST-${String(customers.length + 1).padStart(3, "0")}`,
        name: form.name.trim(),
        category: form.category.trim() || "Customer",
        contactEmail: form.contactEmail.trim(),
        invoiceEmail: form.invoiceEmail.trim() || form.contactEmail.trim(),
        phone: form.phone.trim(),
        terms: form.terms.trim() || "30 Days",
        vatNumber: form.vatNumber.trim() || "N/A",
        status: form.status.trim() || "Active",
        revenue: 0,
        gpMovement: 0,
        outstandingOrders: 0,
        outstandingInvoices: 0,
        averagePaymentDays: 0,
        lifetimeValue: 0,
        onHold: false,
      };
      setCustomers((current) => [next, ...current]);
    }

    setForm({ name: "", category: "Customer", contactEmail: "", invoiceEmail: "", phone: "", terms: "30 Days", vatNumber: "", status: "Active" });
  }

  async function deleteCustomer(id: string) {
    if (!canDelete) {
      alert("You do not have permission to delete customers.");
      return;
    }
    const confirmed = window.confirm(
      "Remove this customer? Customers with invoices will be archived instead of deleted."
    );
    if (!confirmed) return;

    if (!demoMode) {
      try {
        const response = await fetch(`/api/customers/${id}`, { method: "DELETE" });
        const data = await response.json();
        if (!data.ok) {
          alert(data.error || "Failed to delete customer.");
          return;
        }
        if (data.archived && data.customer) {
          setCustomers((current) =>
            current.map((customer) =>
              customer.id === id ? mapApiCustomer(data.customer as Record<string, unknown>) : customer
            )
          );
          return;
        }
      } catch {
        alert("Failed to delete customer.");
        return;
      }
    }

    setCustomers((current) => current.filter((customer) => customer.id !== id));
  }

  async function updateCustomerStatus(id: string, status: string) {
    if (!canEdit) return;
    if (!demoMode) {
      try {
        const response = await fetch(`/api/customers/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const data = await response.json();
        if (!data.ok) {
          alert(data.error || "Failed to update customer.");
          return;
        }
      } catch {
        alert("Failed to update customer.");
        return;
      }
    }

    setCustomers((current) => current.map((customer) => (customer.id === id ? { ...customer, status } : customer)));
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "customers",
        badge: "Premium Sales Workspace",
        title: "Customer Control",
        subtitle: "Customer master, invoice routing, payment terms, revenue history and GP movement — the commercial front door of VYRON COST.",
        outcomes: [
          "Maintain customer master and invoice emails",
          "Track revenue and GP movement per customer",
          "Set payment terms and commercial status",
          "Launch invoices from the customer record",
        ],
        quotes: [
          { label: "Margin", quote: "Revenue is vanity. Margin is sanity." },
          { label: "Commercial", quote: "What gets measured gets protected." },
        ],
        formulaTitle: "Customer commercial formulas",
        formulas: [
          { label: "Invoice GP %", formula: "(Sales − Cost) ÷ Sales × 100" },
          { label: "Customer Revenue", formula: "Σ posted invoice totals (period)" },
          { label: "Avg Invoice Value", formula: "Total sales ÷ invoice count" },
        ],
        intelligenceTitle: "Commercial signals",
        intelligenceItems: [
          { label: "GP movement", detail: "Customers below target GP need repricing or cost review before the next order cycle." },
          { label: "Terms discipline", detail: "Payment terms affect cash flow alongside margin on every sale." },
          { label: "Invoice routing", detail: "Correct invoice email reduces delays and improves debtor control." },
        ],
      }}
    >
    <div className={`grid min-w-0 max-w-full grid-cols-1 gap-6 ${canCreate ? "xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)_minmax(0,300px)]" : "xl:grid-cols-[minmax(0,1fr)_minmax(0,300px)]"}`}>
      {canCreate ? (
      <aside className="min-w-0 rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-700">
            <Plus size={18} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-950">Add Customer</h2>
            <p className="text-xs font-semibold text-slate-500">Customer details, invoice email and contact info.</p>
          </div>
        </div>

        <div className="space-y-3">
          <Field label="Customer Name *" value={form.name} placeholder="Customer Name" onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
          <Field label="Category" value={form.category} placeholder="Hospitality, Retail, Schools" onChange={(value) => setForm((current) => ({ ...current, category: value }))} />
          <Field label="Contact Email" value={form.contactEmail} placeholder="contact@customer.co.za" onChange={(value) => setForm((current) => ({ ...current, contactEmail: value }))} />
          <Field label="Invoice Email" value={form.invoiceEmail} placeholder="accounts@customer.co.za" onChange={(value) => setForm((current) => ({ ...current, invoiceEmail: value }))} />
          <Field label="Phone" value={form.phone} placeholder="021 000 0000" onChange={(value) => setForm((current) => ({ ...current, phone: value }))} />
          <Field label="VAT Number" value={form.vatNumber} placeholder="VAT Number" onChange={(value) => setForm((current) => ({ ...current, vatNumber: value }))} />

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-black text-slate-700">
              Terms
              <select value={form.terms} onChange={(event) => setForm((current) => ({ ...current, terms: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold outline-none">
                <option>COD</option>
                <option>7 Days</option>
                <option>14 Days</option>
                <option>21 Days</option>
                <option>30 Days</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-black text-slate-700">
              Status
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold outline-none">
                <option>Active</option>
                <option>Watch</option>
                <option>Review</option>
                <option>Inactive</option>
              </select>
            </label>
          </div>

          <button onClick={addCustomer} className="w-full rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-4 text-sm font-black uppercase text-white shadow-lg shadow-purple-500/20">
            Save Customer
          </button>
        </div>
      </aside>
      ) : null}

      <section className="min-w-0 rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="mb-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-950">Customers</h2>
              <p className="text-sm font-medium text-slate-500">Manage customer master file, invoice emails and sales terms.</p>
            </div>

            {canCreateInvoice ? (
              <div className="flex shrink-0 flex-wrap gap-2 self-start sm:self-center">
                <Link
                  href="/customer-sales-orders"
                  className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-black text-violet-800"
                >
                  Sales Orders
                </Link>
                <Link
                  href="/customer-invoices"
                  className="inline-flex items-center justify-center rounded-2xl bg-purple-700 px-4 py-3 text-sm font-black text-white"
                >
                  Create Invoice
                </Link>
              </div>
            ) : null}
          </div>

          <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-purple-50 px-4 py-3">
            <Search size={17} className="shrink-0 text-purple-700" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customers..."
              className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-100">
          <div className="min-w-[920px]">
          <div className="grid grid-cols-[1.3fr_1fr_1.4fr_1fr_0.8fr_0.8fr_95px] gap-3 bg-slate-50 px-5 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
            <div>Customer</div>
            <div>Category</div>
            <div>Invoice Email</div>
            <div>Terms</div>
            <div>GP</div>
            <div>Status</div>
            <div>Actions</div>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-dashed border-violet-200 bg-violet-50/50 p-10 text-center text-sm font-semibold text-slate-600">
              Loading customers…
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-violet-200 bg-violet-50/50 p-10 text-center text-sm font-semibold text-slate-600">
              No customers yet. Add your first customer using the form on the left.
            </div>
          ) : null}

          {filteredCustomers.map((customer) => (
            <div key={customer.id} className="grid grid-cols-[1.3fr_1fr_1.4fr_1fr_0.8fr_0.8fr_95px] items-center gap-3 border-t border-slate-100 px-5 py-4 text-sm">
              <div>
                <Link href={`/customers/${customer.id}`} className="font-black text-purple-700 hover:underline">{customer.name}</Link>
                <div className="text-xs font-bold text-slate-500">{customer.id} · {customer.phone || "No phone"}</div>
                {(() => {
                  const stats = readCustomerHistoryLocally(customer.id.toLowerCase());
                  return (
                    <div className="mt-1 text-[11px] font-semibold text-slate-500">
                      Sales {stats.totalSales.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })} · {stats.invoiceCount} invoices · Outstanding Orders {customer.outstandingOrders.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })} · Outstanding Invoices {customer.outstandingInvoices.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })}
                    </div>
                  );
                })()}
                <div className="mt-1 text-[11px] font-semibold text-slate-500">
                  Avg Payment {customer.averagePaymentDays.toFixed(1)} days · LTV {customer.lifetimeValue.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })}
                </div>
              </div>
              <div className="font-semibold text-slate-600">{customer.category}</div>
              <div className="truncate font-bold text-slate-700">{customer.invoiceEmail || "No invoice email"}</div>
              <div className="font-bold text-slate-700">{customer.terms}</div>
              <div className={`font-bold ${customer.gpMovement < 38 ? "text-orange-400" : "text-[#A3E635]"}`}>{customer.gpMovement.toFixed(1)}%</div>
              <div>
                <select value={customer.status} onChange={(event) => updateCustomerStatus(customer.id, event.target.value)} disabled={!canEdit} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-black text-purple-700 outline-none disabled:opacity-60">
                  <option>Active</option>
                  <option>Watch</option>
                  <option>Review</option>
                  <option>On Hold</option>
                  <option>Inactive</option>
                </select>
                {customer.onHold ? <div className="mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-rose-600">On Hold</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/customer-sales-orders?customerId=${customer.id}`}
                  className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800"
                >
                  Sales Orders
                </Link>
                {canDelete ? (
                  <button onClick={() => deleteCustomer(customer.id)} className="rounded-xl bg-rose-50 p-2 text-rose-600">
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          </div>
        </div>
      </section>

      <aside className="min-w-0 rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
            <Users size={21} />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-black text-slate-950">Customer Field Guide</h2>
            <p className="text-xs font-semibold text-slate-500">What each customer field means.</p>
          </div>
        </div>

        <Guide icon={<Users size={17} />} title="Customer Name" text="The trading or account name used for customer invoices and reports." example="Example: Local Café Group" />
        <Guide icon={<FileText size={17} />} title="Category" text="Group customers by sector or buying behaviour." example="Example: Hospitality, Retail, Schools" />
        <Guide icon={<Mail size={17} />} title="Invoice Email" text="The email address used when sending customer invoices." example="Example: accounts@customer.co.za" />
        <Guide icon={<Phone size={17} />} title="Contact Details" text="Operational contact information for orders and follow-ups." example="Example: buyer@customer.co.za" />
        <Guide icon={<Percent size={17} />} title="GP %" text="Gross profit percentage from sales invoices and product cost." example="Used for margin and customer intelligence." />
      </aside>
    </div>
    </VyronPremiumPageShell>
  );
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-xs font-black text-slate-700">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold outline-none placeholder:text-slate-400" />
    </label>
  );
}

function Guide({ icon, title, text, example }: { icon: React.ReactNode; title: string; text: string; example: string }) {
  return (
    <div className="mb-5 flex gap-3">
      <div className="mt-1 text-purple-700">{icon}</div>
      <div>
        <h3 className="text-sm font-black text-purple-700">{title}</h3>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{text}</p>
        <p className="mt-2 text-xs font-black text-slate-500">{example}</p>
      </div>
    </div>
  );
}
