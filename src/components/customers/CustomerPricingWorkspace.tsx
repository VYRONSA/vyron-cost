"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import {
  assignmentRequest,
  customerIsActive,
  customerPriceRows,
  customerPricingSummary,
  searchCustomers,
  type CustomerPriceRow,
  type CustomerPricingSummary,
  type PricingAssignment,
  type PricingItem,
  type PricingList,
} from "@/lib/vyron-customer-pricing-view";

export type PricingCustomer = { id: string; customer_name: string; customer_code?: string | null; trading_name?: string | null; active?: boolean | null; status?: string | null };
type ListDetail = { list: PricingList; items: PricingItem[]; assignedCustomers: Array<{ customerId: string; customerName: string; role: string; status: string }> };
type SearchResult = { id: string; product_name: string; sku?: string | null };

const money = (value: number) => Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const todayIso = () => new Date().toISOString().slice(0, 10);

const STATE_STYLE: Record<CustomerPriceRow["state"], string> = {
  Active: "bg-emerald-50 text-emerald-800",
  Scheduled: "bg-sky-50 text-sky-800",
  Expired: "bg-amber-50 text-amber-800",
  Removed: "bg-slate-100 text-slate-500",
  "List not in use": "bg-amber-50 text-amber-800",
};

/**
 * Customer Price Management: choose a customer, see what they are priced from and at what price,
 * and manage it. Uses the existing price-list endpoints only; edits change the shared list items.
 */
export default function CustomerPricingWorkspace({
  customers,
  lists,
  assignments,
  initialCustomerId,
  reload,
}: {
  customers: PricingCustomer[];
  lists: PricingList[];
  assignments: PricingAssignment[];
  initialCustomerId: string | null;
  reload: () => Promise<{ lists: PricingList[]; assignments: PricingAssignment[] }>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ListDetail>>({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [standardDraft, setStandardDraft] = useState("");
  const [contractDraft, setContractDraft] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ itemId: string; listId: string; value: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SearchResult[]>([]);
  const [addProduct, setAddProduct] = useState<SearchResult | null>(null);
  const [addPrice, setAddPrice] = useState("");
  const [addTarget, setAddTarget] = useState("");
  const loadRequest = useRef(0);
  const today = todayIso();

  const customer = customers.find((c) => c.id === customerId) || null;
  const summary: CustomerPricingSummary | null = useMemo(
    () => (customerId ? customerPricingSummary({ customerId, assignments, lists, today }) : null),
    [customerId, assignments, lists, today]
  );
  const matches = useMemo(() => searchCustomers(customers, query), [customers, query]);
  // An assigned list always appears in its own slot's options, even if its type does not match the slot.
  const slotOptions = (type: PricingList["list_type"], currentId: string | null | undefined) => lists.filter((l) => l.list_type === type || l.id === currentId);
  const standardLists = slotOptions("Standard", customerId ? assignments.find((a) => a.customer_id === customerId)?.default_price_list_id : null);
  const contractLists = slotOptions("Contract", customerId ? assignments.find((a) => a.customer_id === customerId)?.contract_price_list_id : null);
  const assignedCount = assignments.filter((a) => a.status === "Active" && (a.default_price_list_id || a.contract_price_list_id)).length;
  const companyDefault = lists.find((l) => l.is_company_default) || null;

  async function loadDetails(listIds: string[]) {
    const request = ++loadRequest.current;
    if (!listIds.length) return;
    setLoadingDetails(true);
    try {
      const loaded = await Promise.all(
        listIds.map(async (id) => {
          const res = await fetch(`/api/customer-price-lists/${encodeURIComponent(id)}`);
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Could not open the price list.");
          return [id, { list: data.list, items: data.items || [], assignedCustomers: data.assignedCustomers || [] }] as const;
        })
      );
      if (request !== loadRequest.current) return;
      setDetails((prev) => ({ ...prev, ...Object.fromEntries(loaded) }));
    } catch (e) {
      if (request === loadRequest.current) setError(e instanceof Error ? e.message : "Could not open the price list.");
    } finally {
      if (request === loadRequest.current) setLoadingDetails(false);
    }
  }

  function selectCustomer(id: string, data = { lists, assignments }) {
    const s = customerPricingSummary({ customerId: id, assignments: data.assignments, lists: data.lists, today });
    setCustomerId(id);
    setQuery("");
    setOpen(false);
    setMessage("");
    setError("");
    setEditing(null);
    setAdding(false);
    setProductFilter("");
    setStandardDraft(s.assignment?.default_price_list_id || "");
    setContractDraft(s.assignment?.contract_price_list_id || "");
    setAddTarget(s.governingLists[0]?.id || "");
    void loadDetails(s.governingLists.map((l) => l.id));
  }

  // A customer opened from the Price Lists tab ("customers on this list").
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!initialCustomerId || openedFor.current === initialCustomerId || !customers.length) return;
    openedFor.current = initialCustomerId;
    const timer = window.setTimeout(() => selectCustomer(initialCustomerId), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCustomerId, customers.length]);

  // Product search for "Add product" (server-side, company-scoped).
  const addTerm = addQuery.trim();
  const addSearchActive = adding && addTerm.length >= 2 && !addProduct;
  useEffect(() => {
    if (!addSearchActive) return;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/order-intake/lookup?type=product&q=${encodeURIComponent(addTerm)}`);
        const data = await res.json();
        setAddResults(data.ok && Array.isArray(data.results) ? data.results : []);
      } catch {
        setAddResults([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [addSearchActive, addTerm]);

  async function request(url: string, method: "POST" | "PATCH", body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "The change was not saved.");
      setMessage(success);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The change was not saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment(change: { standardListId?: string | null; contractListId?: string | null }, success: string) {
    if (!customerId || !summary) return;
    const current = assignments.find((a) => a.customer_id === customerId) || null;
    const ok = await request("/api/customer-price-lists", "POST", assignmentRequest({ customerId, current, ...change }), success);
    if (!ok) return;
    const fresh = await reload();
    selectCustomer(customerId, fresh);
    setMessage(success);
  }

  async function savePrice(row: CustomerPriceRow) {
    if (!editing) return;
    const ok = await request(`/api/customer-price-lists/${encodeURIComponent(row.listId)}`, "PATCH", { itemId: row.itemId, price: editing.value }, `${row.productName}: price updated on ${row.listName}.`);
    if (ok) {
      setEditing(null);
      await loadDetails(summary?.governingLists.map((l) => l.id) || []);
    }
  }

  async function setRowStatus(row: CustomerPriceRow, status: "Active" | "Inactive") {
    const shared = sharedNote(row.listId);
    if (status === "Inactive" && !window.confirm(`Remove ${row.productName} from ${row.listName}?${shared ? ` ${shared}` : ""} The price is kept and the product can be restored.`)) return;
    const ok = await request(
      `/api/customer-price-lists/${encodeURIComponent(row.listId)}`,
      "PATCH",
      { itemId: row.itemId, status },
      status === "Inactive" ? `${row.productName} removed from ${row.listName}.` : `${row.productName} restored to ${row.listName}.`
    );
    if (ok) await loadDetails(summary?.governingLists.map((l) => l.id) || []);
  }

  async function addToList() {
    if (!addProduct || !addTarget) return;
    const target = lists.find((l) => l.id === addTarget);
    const ok = await request(`/api/customer-price-lists/${encodeURIComponent(addTarget)}`, "POST", { productId: addProduct.id, price: addPrice }, `${addProduct.product_name} added to ${target?.list_name || "the list"}.`);
    if (ok) {
      setAdding(false);
      setAddProduct(null);
      setAddQuery("");
      setAddPrice("");
      await loadDetails(summary?.governingLists.map((l) => l.id) || []);
    }
  }

  /** Who else a change to this list affects. */
  function sharedNote(listId: string): string {
    const list = lists.find((l) => l.id === listId);
    if (summary?.source === "company_default" || (list?.is_company_default && summary?.source !== "assigned")) return "This is the company default list: the change applies to every customer without their own list.";
    const others = (details[listId]?.assignedCustomers || []).filter((c) => c.customerId !== customerId && c.status === "Active").length;
    return others ? `This list is shared: the change also applies to ${others} other customer${others === 1 ? "" : "s"}.` : "";
  }

  const governing = summary?.governingLists || [];
  const rows = summary
    ? customerPriceRows({ lists: governing.filter((l) => details[l.id]).map((l) => ({ list: details[l.id].list ? { ...l, ...details[l.id].list } : l, items: details[l.id].items })), contractListId: summary.contractList?.id || null, today })
    : [];
  const term = productFilter.trim().toLowerCase();
  const visibleRows = rows.filter((r) => (showAll || r.state === "Active") && (!term || r.productName.toLowerCase().includes(term) || String(r.sku || "").toLowerCase().includes(term)));
  const hiddenCount = rows.filter((r) => r.state !== "Active").length;
  const assignmentChanged = summary ? standardDraft !== (summary.assignment?.default_price_list_id || "") || contractDraft !== (summary.assignment?.contract_price_list_id || "") : false;

  return (
    <div className="space-y-4">
      {/* 1. Customer first */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Customer Price Management</h2>
            <p className="text-xs text-slate-500">
              {customers.length} customers · {assignedCount} with their own price list · the rest are priced from {companyDefault ? <b className="text-slate-700">{companyDefault.list_name}</b> : "the product master (no company default set)"}
            </p>
          </div>
        </div>
        <div className="relative mt-3">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setHighlight((h) => Math.min(h + 1, matches.length - 1));
              else if (e.key === "ArrowUp") setHighlight((h) => Math.max(h - 1, 0));
              else if (e.key === "Enter" && matches[highlight]) selectCustomer(matches[highlight].id);
              else if (e.key === "Escape") setOpen(false);
            }}
            placeholder={customer ? `Change customer — currently ${customer.customer_name}` : "Search customers by name or code"}
            aria-label="Search customers"
            role="combobox"
            aria-expanded={open}
            aria-controls="customer-search-results"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold"
          />
          {open && matches.length ? (
            <ul id="customer-search-results" role="listbox" className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {matches.map((c, i) => {
                const a = assignments.find((x) => x.customer_id === c.id && x.status === "Active" && (x.default_price_list_id || x.contract_price_list_id));
                const listName = a ? lists.find((l) => l.id === (a.contract_price_list_id || a.default_price_list_id))?.list_name : null;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === highlight}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectCustomer(c.id)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${i === highlight ? "bg-slate-50" : ""}`}
                    >
                      <span>
                        <span className="font-semibold text-slate-900">{c.customer_name}</span>
                        {c.customer_code ? <span className="text-slate-500"> · {c.customer_code}</span> : null}
                        {!customerIsActive(c) ? <span className="ml-2 text-xs text-slate-400">Inactive</span> : null}
                      </span>
                      <span className="text-xs text-slate-500">{listName ? listName : companyDefault ? `Company default` : "Product master"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </section>

      {message ? <div className="rounded-xl border border-[var(--vyron-success-border)] bg-[var(--vyron-success-bg)] px-4 py-2 text-sm text-[var(--vyron-success-fg)]">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div> : null}

      {customer && summary ? (
        <>
          {/* 2. Who they are and what prices them */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Customer pricing summary">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">{customer.customer_name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${customerIsActive(customer) ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{customerIsActive(customer) ? "Active" : "Inactive"}</span>
                </div>
                {customer.customer_code ? <div className="text-xs text-slate-500">{customer.customer_code}</div> : null}
              </div>
              <ol className="flex flex-wrap items-center gap-1 text-xs font-semibold" aria-label="Pricing hierarchy">
                <li className={`rounded-full px-2.5 py-1 ${summary.source === "assigned" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"}`}>Customer list</li>
                <li className="text-slate-300">→</li>
                <li className={`rounded-full px-2.5 py-1 ${summary.source === "company_default" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"}`}>Company default</li>
                {summary.source === "product_master" ? (
                  <>
                    <li className="text-slate-300">→</li>
                    <li className="rounded-full bg-slate-900 px-2.5 py-1 text-white">Product master</li>
                  </>
                ) : null}
              </ol>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {summary.source === "assigned" ? (
                <>
                  Priced from {summary.contractList ? <b>{summary.contractList.list_name}</b> : null}
                  {summary.contractList && summary.standardList ? " (contract, wins where it prices a product), then " : null}
                  {summary.standardList ? <b>{summary.standardList.list_name}</b> : null}
                  {[summary.contractList, summary.standardList].some((l) => l?.is_company_default) ? " — assigned to this customer; it is also the company default list" : " — assigned to this customer"}.
                </>
              ) : summary.source === "company_default" ? (
                <>
                  <b>No customer price list assigned</b> — using company default: <b>{summary.companyDefault!.list_name}</b>
                  {summary.assignmentInactive ? " (the customer's assignment is inactive)" : ""}.
                </>
              ) : (
                <>
                  <b>No customer price list assigned and no company default set</b> — priced from the product master.
                </>
              )}
            </div>
            {summary.warnings.map((w) => (
              <div key={w} className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {w}
              </div>
            ))}

            {/* Primary: the customer's price list. Secondary (below, muted): an optional contract list. One save covers both. */}
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Assigned price list
                <select value={standardDraft} onChange={(e) => setStandardDraft(e.target.value)} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900">
                  <option value="">{companyDefault ? `None — use company default (${companyDefault.list_name})` : "None"}</option>
                  {standardLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.list_name}
                      {l.is_company_default ? " (company default)" : ""}
                      {l.status !== "Active" ? " — inactive" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !assignmentChanged}
                onClick={() =>
                  void saveAssignment(
                    { standardListId: standardDraft || null, contractListId: contractDraft || null },
                    standardDraft || contractDraft ? `Price list assignment saved for ${customer.customer_name}.` : `${customer.customer_name} now uses the company default.`
                  )
                }
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save Assignment
              </button>
            </div>
            {contractLists.length || summary.contractList ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-2 text-xs text-slate-500">
                <label htmlFor="contract-list" className="font-semibold">
                  Contract pricing (optional)
                </label>
                <select id="contract-list" value={contractDraft} onChange={(e) => setContractDraft(e.target.value)} disabled={busy} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                  <option value="">No contract list</option>
                  {contractLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.list_name}
                      {l.status !== "Active" ? " — inactive" : ""}
                    </option>
                  ))}
                </select>
                <span>A contract list overrides the assigned list only for the products it prices. Saved with the assignment.</span>
              </div>
            ) : null}
          </section>

          {/* 3. What they pay */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Customer prices">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">Prices for {customer.customer_name}</h3>
                <p className="text-xs text-slate-500">
                  {summary.source === "assigned"
                    ? `From the assigned list${governing.length > 1 ? "s" : ""}. ${governing.map((l) => sharedNote(l.id)).filter(Boolean).join(" ")}`
                    : summary.source === "company_default"
                      ? `From the company default list ${summary.companyDefault!.list_name} — not a customer-specific list. Changes apply to every customer without their own list.`
                      : "This customer has no list prices."}
                </p>
              </div>
              {governing.length ? (
                <button type="button" disabled={busy} onClick={() => setAdding((v) => !v)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {adding ? "Cancel" : "Add product"}
                </button>
              ) : null}
            </div>

            {adding ? (
              <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,12rem)_auto]">
                <div className="relative">
                  <input
                    value={addQuery}
                    onChange={(e) => {
                      setAddQuery(e.target.value);
                      setAddProduct(null);
                    }}
                    placeholder="Search products by name or SKU"
                    aria-label="Search products to add"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  {addSearchActive && addResults.length ? (
                    <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {addResults.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setAddProduct(r);
                            setAddQuery(r.product_name);
                            setAddResults([]);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="font-semibold text-slate-900">{r.product_name}</span>
                          {r.sku ? <span className="text-slate-500"> ({r.sku})</span> : null}
                          {rows.some((row) => row.productId === r.id && row.listId === addTarget) ? <span className="ml-2 text-xs text-slate-500">already on this list</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <input value={addPrice} onChange={(e) => setAddPrice(e.target.value)} placeholder="Price" inputMode="decimal" aria-label="Price" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                {governing.length > 1 ? (
                  <select value={addTarget} onChange={(e) => setAddTarget(e.target.value)} aria-label="Add to list" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {governing.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.list_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="self-center text-xs text-slate-500">to {governing[0]?.list_name}</div>
                )}
                <button type="button" disabled={busy || !addProduct || !addPrice.trim()} onClick={() => void addToList()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  Add
                </button>
                {sharedNote(addTarget) ? <p className="text-xs text-amber-800 sm:col-span-4">{sharedNote(addTarget)}</p> : null}
              </div>
            ) : null}

            {governing.length ? (
              <>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <input value={productFilter} onChange={(e) => setProductFilter(e.target.value)} placeholder="Search products" aria-label="Search this customer's products" className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                  <div className="flex items-center gap-3 text-xs text-slate-600">
                    <span>
                      <b className="text-slate-900">{rows.filter((r) => r.state === "Active").length}</b> priced today
                    </span>
                    {hiddenCount ? (
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                        Show {hiddenCount} scheduled, expired or removed
                      </label>
                    ) : null}
                  </div>
                </div>
                <EnterpriseScrollContainer className="mt-2">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Product</th>
                        <th className="px-2 py-2">SKU</th>
                        <th className="px-2 py-2 text-right">Price</th>
                        <th className="px-2 py-2">Effective</th>
                        <th className="px-2 py-2">Status</th>
                        {governing.length > 1 ? <th className="px-2 py-2">From list</th> : null}
                        <th className="px-2 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingDetails && !rows.length ? (
                        <tr>
                          <td colSpan={7} className="px-2 py-4 text-center text-sm text-slate-500">
                            Loading prices…
                          </td>
                        </tr>
                      ) : null}
                      {!loadingDetails && !visibleRows.length ? (
                        <tr>
                          <td colSpan={7} className="px-2 py-4 text-center text-sm text-slate-500">
                            {rows.length ? "No products match." : "No products on this list yet — this customer has no list prices."}
                          </td>
                        </tr>
                      ) : null}
                      {visibleRows.map((row) => {
                        const isEditing = editing?.itemId === row.itemId;
                        return (
                          <tr key={`${row.listId}-${row.itemId}`} className={`border-t border-slate-100 ${row.state === "Removed" ? "text-slate-400" : ""}`}>
                            <td className="min-w-[12rem] px-2 py-2 font-semibold">
                              {row.productName}
                              {row.overrides ? <span className="block text-xs font-normal text-slate-500">Overrides {row.overrides.listName} (R {money(row.overrides.price)})</span> : null}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2">{row.sku || "—"}</td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {isEditing ? (
                                <input
                                  autoFocus
                                  value={editing.value}
                                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") void savePrice(row);
                                    if (e.key === "Escape") setEditing(null);
                                  }}
                                  inputMode="decimal"
                                  aria-label={`Price for ${row.productName}`}
                                  className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm"
                                />
                              ) : (
                                `R ${money(row.price)}`
                              )}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-xs">{row.effectiveFrom || row.effectiveTo ? `${row.effectiveFrom || "…"} – ${row.effectiveTo || "open"}` : "Always"}</td>
                            <td className="px-2 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE_STYLE[row.state]}`}>{row.state}</span>
                            </td>
                            {governing.length > 1 ? <td className="whitespace-nowrap px-2 py-2 text-xs">{row.listName}</td> : null}
                            <td className="whitespace-nowrap px-2 py-2 text-right">
                              <div className="flex justify-end gap-2">
                                {row.state === "Removed" ? (
                                  <button type="button" disabled={busy} onClick={() => void setRowStatus(row, "Active")} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">
                                    Restore
                                  </button>
                                ) : isEditing ? (
                                  <>
                                    <button type="button" disabled={busy} onClick={() => void savePrice(row)} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">
                                      Save
                                    </button>
                                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700">
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" disabled={busy} onClick={() => setEditing({ itemId: row.itemId, listId: row.listId, value: String(row.price) })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">
                                      Edit price
                                    </button>
                                    <button type="button" disabled={busy} onClick={() => void setRowStatus(row, "Inactive")} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">
                                      Remove
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </EnterpriseScrollContainer>
                {editing && sharedNote(editing.listId) ? <p className="mt-2 text-xs text-amber-800">{sharedNote(editing.listId)}</p> : null}
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
