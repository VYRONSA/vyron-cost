"use client";

import { Search, Users, Mail, Phone, FileText, Percent, Trash2, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { readCustomerHistoryLocally } from "@/lib/vyron-cost/customer-invoice-flow";

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
};

const initialCustomers: Customer[] = [
  { id: "CUST-001", name: "Local Café Group", category: "Hospitality Group", contactEmail: "manager@localcafegroup.co.za", invoiceEmail: "accounts@localcafegroup.co.za", phone: "021 555 0148", terms: "7 Days", vatNumber: "4890123456", status: "Active", revenue: 128500, gpMovement: 42.3 },
  { id: "CUST-002", name: "Farmstall Foods", category: "Retail / Farmstall", contactEmail: "buyer@farmstallfoods.co.za", invoiceEmail: "orders@farmstallfoods.co.za", phone: "021 555 0191", terms: "14 Days", vatNumber: "4120987654", status: "Active", revenue: 94200, gpMovement: 38.5 },
  { id: "CUST-003", name: "Corporate Canteen Supplies", category: "Corporate Catering", contactEmail: "procurement@corporatecanteens.co.za", invoiceEmail: "finance@corporatecanteens.co.za", phone: "011 555 0188", terms: "30 Days", vatNumber: "4678901234", status: "Active", revenue: 76800, gpMovement: 45.1 },
  { id: "CUST-004", name: "School Tuckshop Network", category: "Schools", contactEmail: "admin@schooltuckshops.co.za", invoiceEmail: "admin@schooltuckshops.co.za", phone: "010 555 0144", terms: "COD", vatNumber: "N/A", status: "Active", revenue: 55200, gpMovement: 39.2 },
  { id: "CUST-005", name: "Cape Deli Distribution", category: "Distributor", contactEmail: "orders@capedeli.co.za", invoiceEmail: "accounts@capedeli.co.za", phone: "021 555 0112", terms: "30 Days", vatNumber: "4215678901", status: "Review", revenue: 68400, gpMovement: 36.4 },
  { id: "CUST-006", name: "Winelands Coffee Stops", category: "Hospitality", contactEmail: "ops@winelandscoffee.co.za", invoiceEmail: "finance@winelandscoffee.co.za", phone: "021 555 0180", terms: "14 Days", vatNumber: "4556789012", status: "Active", revenue: 49600, gpMovement: 41.8 },
  { id: "CUST-007", name: "Factory Canteen Group", category: "Industrial Catering", contactEmail: "orders@factorycanteens.co.za", invoiceEmail: "accounts@factorycanteens.co.za", phone: "011 555 0166", terms: "30 Days", vatNumber: "4789012345", status: "Watch", revenue: 73200, gpMovement: 35.9 },
  { id: "CUST-008", name: "Northern Suburbs Grocers", category: "Retail", contactEmail: "buying@nsgrocers.co.za", invoiceEmail: "accounts@nsgrocers.co.za", phone: "021 555 0160", terms: "21 Days", vatNumber: "4987654321", status: "Active", revenue: 58800, gpMovement: 40.2 },
];

export default function CustomersClient() {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
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

  function addCustomer() {
    if (!form.name.trim()) {
      alert("Please enter a customer name.");
      return;
    }

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
    };

    setCustomers((current) => [next, ...current]);
    setForm({ name: "", category: "Customer", contactEmail: "", invoiceEmail: "", phone: "", terms: "30 Days", vatNumber: "", status: "Active" });
  }

  function deleteCustomer(id: string) {
    const confirmed = window.confirm("Delete this customer from the demo customer file?");
    if (!confirmed) return;
    setCustomers((current) => current.filter((customer) => customer.id !== id));
  }

  function updateCustomerStatus(id: string, status: string) {
    setCustomers((current) => current.map((customer) => (customer.id === id ? { ...customer, status } : customer)));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
      <aside className="rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
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

      <section className="rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-black text-slate-950">Customers</h2>
            <p className="text-sm font-medium text-slate-500">Manage customer master file, invoice emails and sales terms.</p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex min-w-[260px] items-center gap-2 rounded-2xl bg-purple-50 px-4 py-3">
              <Search size={17} className="text-purple-700" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers..." className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400" />
            </div>

            <Link href="/customer-invoices" className="rounded-2xl bg-purple-700 px-4 py-3 text-sm font-black text-white">
              Create Invoice
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-100">
          <div className="grid grid-cols-[1.3fr_1fr_1.4fr_1fr_0.8fr_0.8fr_95px] gap-3 bg-slate-50 px-5 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
            <div>Customer</div>
            <div>Category</div>
            <div>Invoice Email</div>
            <div>Terms</div>
            <div>GP</div>
            <div>Status</div>
            <div>Actions</div>
          </div>

          {filteredCustomers.map((customer) => (
            <div key={customer.id} className="grid grid-cols-[1.3fr_1fr_1.4fr_1fr_0.8fr_0.8fr_95px] items-center gap-3 border-t border-slate-100 px-5 py-4 text-sm">
              <div>
                <div className="font-black text-purple-700">{customer.name}</div>
                <div className="text-xs font-bold text-slate-500">{customer.id} · {customer.phone || "No phone"}</div>
                {(() => {
                  const stats = readCustomerHistoryLocally(customer.id.toLowerCase());
                  if (!stats.invoiceCount) return null;
                  return (
                    <div className="mt-1 text-[11px] font-semibold text-slate-500">
                      Sales {stats.totalSales.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })} · {stats.invoiceCount} invoices · Last {stats.lastInvoiceDate || "—"} · Avg {stats.averageInvoiceValue.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })}
                    </div>
                  );
                })()}
              </div>
              <div className="font-semibold text-slate-600">{customer.category}</div>
              <div className="truncate font-bold text-slate-700">{customer.invoiceEmail || "No invoice email"}</div>
              <div className="font-bold text-slate-700">{customer.terms}</div>
              <div className={`font-black ${customer.gpMovement < 38 ? "text-rose-600" : "text-emerald-600"}`}>{customer.gpMovement.toFixed(1)}%</div>
              <div>
                <select value={customer.status} onChange={(event) => updateCustomerStatus(customer.id, event.target.value)} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-black text-purple-700 outline-none">
                  <option>Active</option>
                  <option>Watch</option>
                  <option>Review</option>
                  <option>Inactive</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">Edit</button>
                <button onClick={() => deleteCustomer(customer.id)} className="rounded-xl bg-rose-50 p-2 text-rose-600">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className="rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
            <Users size={21} />
          </div>
          <div>
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
