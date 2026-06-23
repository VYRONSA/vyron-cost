"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookUser, Mail, Phone, RefreshCcw, Search } from "lucide-react";
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
  updated_at: string;
};

const FILTERS: Array<{ key: ContactFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "customer", label: "Customer" },
  { key: "supplier", label: "Supplier" },
  { key: "both", label: "Customer + Supplier" },
];

const M = VYRON_MASTER;

function contactTypeLabel(contact: VyronContact) {
  if (contact.is_customer && contact.is_supplier) return "Customer + Supplier";
  if (contact.is_customer) return "Customer";
  if (contact.is_supplier) return "Supplier";
  return "Unclassified";
}

export default function ContactCentreClient() {
  const [contacts, setContacts] = useState<VyronContact[]>([]);
  const [filter, setFilter] = useState<ContactFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    void loadContacts(filter);
  }, [filter, loadContacts]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) => {
      const haystack = [
        contact.contact_name,
        contact.email || "",
        contact.phone || "",
        contact.xero_contact_id || "",
        contactTypeLabel(contact),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [contacts, search]);

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
      setMessage(
        `Migration complete: ${customerCount} customer row(s) and ${supplierCount} supplier row(s) processed into Contact Master.`
      );
      await loadContacts(filter);
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

          <div className="mt-5 overflow-x-auto rounded-2xl border border-[#E2E8F0]">
            <table className="min-w-full">
              <thead className={VYRON_TABLE.head}>
                <tr>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Phone</th>
                  <th className="px-4 py-3 text-left">Xero Contact ID</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      Loading contacts…
                    </td>
                  </tr>
                ) : filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      No contacts found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map((contact) => (
                    <tr key={contact.id} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-bold text-[#0F172A]">
                          <BookUser size={16} className="text-[#64748B]" />
                          {contact.contact_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#334155]">{contactTypeLabel(contact)}</td>
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
    </VyronPremiumPageShell>
  );
}
