"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookUser, Mail, Phone, RefreshCcw, Search, X } from "lucide-react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";

type ContactFilter = "all" | "customer" | "supplier" | "both";

type VyronContact = {
  id: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  xero_contact_id: string | null;
  is_customer: boolean;
  is_supplier: boolean;
  created_at: string;
  updated_at: string;
};

type ContactStats = {
  total: number;
  customers: number;
  suppliers: number;
  both: number;
};

type BulkAction =
  | "mark-customer"
  | "mark-supplier"
  | "mark-both"
  | "remove-customer"
  | "remove-supplier";

const FILTERS: Array<{ key: ContactFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "customer", label: "Customer" },
  { key: "supplier", label: "Supplier" },
  { key: "both", label: "Customer + Supplier" },
];

const BULK_ACTIONS: Array<{ key: BulkAction; label: string }> = [
  { key: "mark-customer", label: "Mark as Customer" },
  { key: "mark-supplier", label: "Mark as Supplier" },
  { key: "mark-both", label: "Mark as Both" },
  { key: "remove-customer", label: "Remove Customer" },
  { key: "remove-supplier", label: "Remove Supplier" },
];

const M = VYRON_MASTER;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function ContactBadge({ contact }: { contact: VyronContact }) {
  if (contact.is_customer && contact.is_supplier) {
    return (
      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-800">
        Customer + Supplier
      </span>
    );
  }
  if (contact.is_customer) {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-800">
        Customer
      </span>
    );
  }
  if (contact.is_supplier) {
    return (
      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-sky-800">
        Supplier
      </span>
    );
  }
  return <span className="text-sm font-semibold text-[#94A3B8]">Unclassified</span>;
}

function RoleCheckbox({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#334155]"
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-[#CBD5E1] disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={label}
      />
      <span>{label}</span>
    </label>
  );
}

export default function ContactCentreClient() {
  const [contacts, setContacts] = useState<VyronContact[]>([]);
  const [stats, setStats] = useState<ContactStats>({ total: 0, customers: 0, suppliers: 0, both: 0 });
  const [filter, setFilter] = useState<ContactFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<VyronContact | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch("/api/contacts/stats");
      const data = await response.json();
      if (data.ok && data.stats) {
        setStats(data.stats as ContactStats);
      }
    } catch {
      // non-blocking
    }
  }, []);

  const loadContacts = useCallback(async (nextFilter: ContactFilter) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/contacts?filter=${nextFilter}`);
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Could not load contacts.");
        setContacts([]);
        return;
      }
      setContacts(Array.isArray(data.contacts) ? data.contacts : []);
    } catch {
      setError("Could not load contacts.");
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadContacts(filter), loadStats()]);
  }, [filter, loadContacts, loadStats]);

  useEffect(() => {
    void loadContacts(filter);
    void loadStats();
  }, [filter, loadContacts, loadStats]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [filter, search]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) => {
      const haystack = [
        contact.contact_name,
        contact.email || "",
        contact.phone || "",
        contact.xero_contact_id || "",
        contact.is_customer ? "customer" : "",
        contact.is_supplier ? "supplier" : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [contacts, search]);

  const allVisibleSelected =
    filteredContacts.length > 0 && filteredContacts.every((contact) => selectedIds.has(contact.id));

  function applyContactUpdate(updated: VyronContact) {
    setContacts((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    if (selectedContact?.id === updated.id) {
      setSelectedContact(updated);
    }
  }

  async function updateInlineRole(
    contact: VyronContact,
    patch: { is_customer?: boolean; is_supplier?: boolean }
  ) {
    const previous = { ...contact };
    const optimistic: VyronContact = {
      ...contact,
      is_customer: patch.is_customer !== undefined ? patch.is_customer : contact.is_customer,
      is_supplier: patch.is_supplier !== undefined ? patch.is_supplier : contact.is_supplier,
    };

    setUpdatingId(contact.id);
    setError(null);
    applyContactUpdate(optimistic);

    try {
      const response = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!data.ok) {
        applyContactUpdate(previous);
        setError(data.error || "Could not update contact role.");
        return;
      }
      applyContactUpdate(data.contact as VyronContact);
      await refreshAll();
    } catch {
      applyContactUpdate(previous);
      setError("Could not update contact role.");
    } finally {
      setUpdatingId(null);
    }
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredContacts.map((contact) => contact.id)));
  }

  function toggleRowSelected(contactId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  async function runBulkAction(action: BulkAction) {
    const contactIds = [...selectedIds];
    if (!contactIds.length) return;

    setBulkBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, contactIds }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Bulk update failed.");
        return;
      }

      const updatedContacts = Array.isArray(data.contacts) ? (data.contacts as VyronContact[]) : [];
      for (const updated of updatedContacts) {
        applyContactUpdate(updated);
      }

      setMessage(`Updated ${data.updated ?? updatedContacts.length} contact(s).`);
      if (data.errors?.length) {
        setError(data.errors.slice(0, 5).join(" · "));
      }
      setSelectedIds(new Set());
      await refreshAll();
    } catch {
      setError("Bulk update failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function openContactDetail(contact: VyronContact) {
    setSelectedContact(contact);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/contacts/${contact.id}`);
      const data = await response.json();
      if (data.ok && data.contact) {
        setSelectedContact(data.contact as VyronContact);
      }
    } catch {
      // keep list row data
    } finally {
      setDetailLoading(false);
    }
  }

  async function runMigration() {
    setMigrating(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/contacts/migrate", { method: "POST" });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Contact migration failed.");
        return;
      }

      const customerCount = Number(data.customers?.imported ?? 0) + Number(data.customers?.merged ?? 0);
      const supplierCount = Number(data.suppliers?.imported ?? 0) + Number(data.suppliers?.merged ?? 0);
      const migrationStats = data.stats as ContactStats | undefined;
      setMessage(
        `Migration complete: ${customerCount} customer row(s) and ${supplierCount} supplier row(s) processed. ` +
          (migrationStats
            ? `Contact Master now has ${migrationStats.total} contacts (${migrationStats.customers} customers, ${migrationStats.suppliers} suppliers, ${migrationStats.both} both).`
            : "")
      );
      if (migrationStats) setStats(migrationStats);
      await refreshAll();
    } catch {
      setError("Contact migration failed.");
    } finally {
      setMigrating(false);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Contact Intelligence",
        title: "Contact Centre",
        subtitle: "Unified contact master across customers and suppliers with Xero contact linkage.",
        outcomes: [
          "Single view of customer and supplier contacts",
          "Merge contacts by Xero Contact ID",
          "Foundation for contact intelligence workflows",
        ],
      }}
      actions={
        <button
          type="button"
          onClick={() => void runMigration()}
          disabled={migrating}
          className={`${M.primaryBtn} inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <RefreshCcw size={16} className={migrating ? "animate-spin" : ""} />
          {migrating ? "Migrating…" : "Import Existing Customers & Suppliers"}
        </button>
      }
    >
      <div className="space-y-6">
        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Contacts", value: stats.total },
            { label: "Customers", value: stats.customers },
            { label: "Suppliers", value: stats.suppliers },
            { label: "Customer + Supplier", value: stats.both },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4">
              <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">{card.label}</div>
              <div className="mt-2 text-3xl font-black text-[#0F172A]">{card.value}</div>
            </div>
          ))}
        </section>

        <section className={M.moduleDataSection}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    filter === item.key
                      ? "bg-[#0F172A] text-white"
                      : "border border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search contacts"
                className="w-full rounded-xl border border-[#E2E8F0] bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-[#0F172A]"
              />
            </div>
          </div>

          {selectedIds.size > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
              <span className="text-sm font-bold text-[#334155]">{selectedIds.size} selected</span>
              {BULK_ACTIONS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void runBulkAction(item.key)}
                  className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-bold text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-60"
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto text-xs font-bold text-[#64748B] hover:text-[#334155]"
              >
                Clear selection
              </button>
            </div>
          ) : null}

          <div className="mt-5 overflow-x-auto rounded-2xl border border-[#E2E8F0]">
            <table className="min-w-full">
              <thead className={VYRON_TABLE.head}>
                <tr>
                  <th className="px-4 py-3 text-left">
                    <label className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-[#CBD5E1]"
                        aria-label="Select all contacts"
                      />
                      Select All
                    </label>
                  </th>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Supplier</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Phone</th>
                  <th className="px-4 py-3 text-left">Xero Contact ID</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      Loading contacts…
                    </td>
                  </tr>
                ) : filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      No contacts found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map((contact) => (
                    <tr
                      key={contact.id}
                      className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover} cursor-pointer`}
                      onClick={() => void openContactDetail(contact)}
                    >
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(contact.id)}
                          onChange={() => toggleRowSelected(contact.id)}
                          className="h-4 w-4 rounded border-[#CBD5E1]"
                          aria-label={`Select ${contact.contact_name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-bold text-[#0F172A]">
                          <BookUser size={16} className="text-[#64748B]" />
                          {contact.contact_name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ContactBadge contact={contact} />
                      </td>
                      <td className="px-4 py-3">
                        <RoleCheckbox
                          checked={contact.is_customer}
                          disabled={updatingId === contact.id || bulkBusy}
                          label="Customer"
                          onChange={(next) => void updateInlineRole(contact, { is_customer: next })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <RoleCheckbox
                          checked={contact.is_supplier}
                          disabled={updatingId === contact.id || bulkBusy}
                          label="Supplier"
                          onChange={(next) => void updateInlineRole(contact, { is_supplier: next })}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">
                        <span className="inline-flex items-center gap-1">
                          <Mail size={14} />
                          {contact.email || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">
                        <span className="inline-flex items-center gap-1">
                          <Phone size={14} />
                          {contact.phone || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-[#64748B]">{contact.xero_contact_id || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedContact ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
          <div className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-4">
              <h2 className="text-lg font-black text-[#0F172A]">Contact Detail</h2>
              <button
                type="button"
                onClick={() => setSelectedContact(null)}
                className="rounded-lg p-2 text-[#64748B] hover:bg-[#F8FAFC]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              {detailLoading ? (
                <p className="text-sm font-semibold text-[#64748B]">Loading contact…</p>
              ) : (
                <>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Contact Name</div>
                    <div className="mt-1 text-xl font-black text-[#0F172A]">{selectedContact.contact_name}</div>
                    <div className="mt-3">
                      <ContactBadge contact={selectedContact} />
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Email</div>
                      <div className="mt-1 text-sm font-semibold text-[#334155]">{selectedContact.email || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Phone</div>
                      <div className="mt-1 text-sm font-semibold text-[#334155]">{selectedContact.phone || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Xero Contact ID</div>
                      <div className="mt-1 font-mono text-sm text-[#334155]">
                        {selectedContact.xero_contact_id || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Created Date</div>
                      <div className="mt-1 text-sm font-semibold text-[#334155]">
                        {formatDate(selectedContact.created_at)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Updated Date</div>
                      <div className="mt-1 text-sm font-semibold text-[#334155]">
                        {formatDate(selectedContact.updated_at)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Notes</div>
                      <div className="mt-1 text-sm font-semibold text-[#64748B]">—</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">History</div>
                      <div className="mt-1 text-sm font-semibold text-[#64748B]">No history recorded yet.</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </VyronPremiumPageShell>
  );
}
