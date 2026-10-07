"use client";


import Link from "next/link";
import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import { useEffect, useRef, useState } from "react";
import CustomerPricingWorkspace, { type PricingCustomer } from "@/components/customers/CustomerPricingWorkspace";

type PriceList = {
  id: string;
  list_name: string;
  list_type: "Standard" | "Contract";
  status: "Active" | "Inactive";
  version: number;
  effective_from?: string | null;
  effective_to?: string | null;
  /** Customers without a price list are priced from the company default list. */
  is_company_default?: boolean | null;
};

type Product = { id: string; product_name: string; sku?: string | null };
type Customer = PricingCustomer;

type Assignment = {
  id: string;
  customer_id: string;
  default_price_list_id: string | null;
  contract_price_list_id: string | null;
  status: "Active" | "Inactive";
};

type DetailItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  finalPrice: number;
  status: "Active" | "Inactive";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  updatedAt: string | null;
};

type ListDetail = {
  list: PriceList & { notes?: string | null };
  items: DetailItem[];
  assignedCustomers: Array<{ customerId: string; customerName: string; role: "Default" | "Contract"; status: string }>;
  history: Array<{ at: string; event: string; actor: string | null; detail: string | null }>;
};

type SearchResult = { id: string; product_name: string; sku?: string | null };

const money = (value: number) =>
  Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export default function CustomerPriceListsClient() {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [newListName, setNewListName] = useState("");
  const [newListType, setNewListType] = useState<"Standard" | "Contract">("Standard");

  const [lineProductId, setLineProductId] = useState("");
  const [basePrice, setBasePrice] = useState("0");
  const [markupPct, setMarkupPct] = useState("0");
  const [discountPct, setDiscountPct] = useState("0");
  const [gpPct, setGpPct] = useState("0");
  const [overridePrice, setOverridePrice] = useState("");

  const [newListFrom, setNewListFrom] = useState("");
  const [newListTo, setNewListTo] = useState("");
  // Customer pricing is the main workflow; list administration is secondary.
  const [tab, setTab] = useState<"customers" | "lists">("customers");
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);

  // Price list detail / editor
  const [detail, setDetail] = useState<ListDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [showInactive, setShowInactive] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addProduct, setAddProduct] = useState<SearchResult | null>(null);
  const [addPrice, setAddPrice] = useState("");
  // Only the most recently opened list may fill the editor.
  const detailRequest = useRef(0);


  async function loadDetail(listId: string) {
    const request = ++detailRequest.current;
    if (!listId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError("");
    try {
      const res = await fetch(`/api/customer-price-lists/${encodeURIComponent(listId)}`);
      const data = await res.json();
      if (request !== detailRequest.current) return;
      if (!data.ok) throw new Error(data.error || "Could not open the price list.");
      setDetail({ list: data.list, items: data.items || [], assignedCustomers: data.assignedCustomers || [], history: data.history || [] });
      setPriceDrafts({});
    } catch (e) {
      if (request !== detailRequest.current) return;
      setDetail(null);
      setDetailError(e instanceof Error ? e.message : "Could not open the price list.");
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }

  /** Make this list the company default price list, or clear it (PATCH { companyDefault }). */
  async function toggleCompanyDefault(listId: string, makeDefault: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/customer-price-lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyDefault: makeDefault }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Could not change the company default.");
      setMessage(makeDefault ? "This is now the company default price list." : "Company default cleared.");
      await loadData();
      await loadDetail(listId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not change the company default.");
    } finally {
      setBusy(false);
    }
  }

  async function loadData(): Promise<{ lists: PriceList[]; assignments: Assignment[] }> {
    const [listRes, productRes, customerRes] = await Promise.all([
      fetch("/api/customer-price-lists"),
      fetch("/api/products"),
      fetch("/api/customers"),
    ]);
    const [listData, productData, customerData] = await Promise.all([
      listRes.json(),
      productRes.json(),
      customerRes.json(),
    ]);

    if (!listData.ok) throw new Error(listData.error || "Failed to load price lists.");
    if (!productData.ok) throw new Error(productData.error || "Failed to load products.");
    if (!customerData.ok) throw new Error(customerData.error || "Failed to load customers.");

    setLists(Array.isArray(listData.lists) ? listData.lists : []);
    setAssignments(Array.isArray(listData.assignments) ? listData.assignments : []);
    setProducts(Array.isArray(productData.products) ? productData.products : []);
    setCustomers(Array.isArray(customerData.customers) ? customerData.customers : []);

    if (!selectedListId && listData.lists?.length) {
      const firstId = String(listData.lists[0].id);
      setSelectedListId(firstId);
      void loadDetail(firstId);
    }
    return { lists: Array.isArray(listData.lists) ? listData.lists : [], assignments: Array.isArray(listData.assignments) ? listData.assignments : [] };
  }

  useEffect(() => {
    void loadData().catch((e) => setError(e instanceof Error ? e.message : "Load failed."));
  }, []);


  /** Open a list in the editor, clearing anything half-entered for the previous one. */
  function openList(listId: string) {
    setSelectedListId(listId);
    setProductQuery("");
    setSearchResults([]);
    setAddProduct(null);
    setAddPrice("");
    void loadDetail(listId);
  }

  // Product search runs on the server (company-scoped, at most 20 rows).
  const searchTerm = productQuery.trim();
  const searchActive = searchTerm.length >= 2 && !addProduct;
  const shownResults = searchActive ? searchResults : [];
  useEffect(() => {
    if (!searchActive) return;
    const q = searchTerm;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/order-intake/lookup?type=product&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSearchResults(data.ok && Array.isArray(data.results) ? data.results : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchActive, searchTerm]);

  async function editorRequest(method: "POST" | "PATCH", body: Record<string, unknown>, success: string) {
    if (!selectedListId) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/customer-price-lists/${encodeURIComponent(selectedListId)}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "The change was not saved.");
      setMessage(success);
      await loadDetail(selectedListId);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The change was not saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveItemPrice(item: DetailItem) {
    const draft = priceDrafts[item.id];
    if (draft === undefined) return;
    await editorRequest("PATCH", { itemId: item.id, price: draft }, `${item.productName}: price updated.`);
  }

  async function setItemStatus(item: DetailItem, status: "Active" | "Inactive") {
    if (status === "Inactive" && !window.confirm(`Remove ${item.productName} from this price list? Customers on this list will no longer be able to order it. The price is kept and it can be restored.`)) {
      return;
    }
    await editorRequest("PATCH", { itemId: item.id, status }, status === "Inactive" ? `${item.productName} removed from the list.` : `${item.productName} restored to the list.`);
  }

  async function addProductToList() {
    if (!addProduct) {
      setError("Search for and choose a product first.");
      return;
    }
    const ok = await editorRequest("POST", { productId: addProduct.id, price: addPrice }, `${addProduct.product_name} added to the list.`);
    if (ok) {
      setAddProduct(null);
      setProductQuery("");
      setAddPrice("");
    }
  }

  async function createList() {
    if (!newListName.trim()) {
      setError("List name is required.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/customer-price-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create_list",
          listName: newListName,
          listType: newListType,
          effectiveFrom: newListFrom || null,
          effectiveTo: newListTo || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Create list failed.");
      setMessage("Price list created.");
      setNewListName("");
      setNewListFrom("");
      setNewListTo("");
      await loadData();
      openList(String(data.list?.id || selectedListId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create list failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addItem() {
    if (!selectedListId || !lineProductId) {
      setError("Select a list and product first.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/customer-price-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "upsert_items",
          priceListId: selectedListId,
          items: [
            {
              productId: lineProductId,
              basePrice: Number(basePrice || 0),
              markupPct: Number(markupPct || 0),
              discountPct: Number(discountPct || 0),
              gpPct: Number(gpPct || 0),
              overridePrice: overridePrice.trim() ? Number(overridePrice) : null,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Add item failed.");
      setMessage("Price list item saved.");
      await loadDetail(selectedListId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add item failed.");
    } finally {
      setBusy(false);
    }
  }

  const activeItems = detail?.items.filter((item) => item.status === "Active") || [];
  const inactiveItems = detail?.items.filter((item) => item.status === "Inactive") || [];
  const visibleItems = showInactive ? detail?.items || [] : activeItems;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Customer pricing" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm font-semibold">
          <button type="button" role="tab" aria-selected={tab === "customers"} onClick={() => setTab("customers")} className={`rounded-lg px-4 py-1.5 ${tab === "customers" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}>
            Customer Pricing
          </button>
          <button type="button" role="tab" aria-selected={tab === "lists"} onClick={() => setTab("lists")} className={`rounded-lg px-4 py-1.5 ${tab === "lists" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}>
            Price Lists ({lists.length})
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <Link href="/reports/customer-price-list" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:border-slate-400">Price List Report</Link>
          <Link href="/reports/sales-by-customer-item" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:border-slate-400">Sales by Customer / Item</Link>
        </div>
      </div>

      {tab === "customers" ? (
        <CustomerPricingWorkspace customers={customers} lists={lists} assignments={assignments} initialCustomerId={openCustomerId} reload={loadData} />
      ) : (
      <div className="space-y-4">
      {message ?<div className="rounded-xl border border-[var(--vyron-success-border)] bg-[var(--vyron-success-bg)] px-4 py-2 text-sm text-[var(--vyron-success-fg)]">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div> : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-bold text-slate-900">Create Price List</h2>
          <div className="mt-3 grid gap-2">
            <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="List name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={newListType} onChange={(e) => setNewListType(e.target.value === "Contract" ? "Contract" : "Standard")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="Standard">Standard</option>
              <option value="Contract">Contract</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-slate-600">
                Effective from (optional)
                <input type="date" value={newListFrom} onChange={(e) => setNewListFrom(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-xs text-slate-600">
                Effective to (optional)
                <input type="date" value={newListTo} onChange={(e) => setNewListTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>
            <button type="button" onClick={() => void createList()} disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Create</button>
          </div>

          <h3 className="mt-5 text-sm font-semibold text-slate-900">Available Lists</h3>
          <div className="mt-2 space-y-2">
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                onClick={() => openList(list.id)}
                aria-pressed={selectedListId === list.id}
                title="Open this price list"
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedListId === list.id ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-400"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900">{list.list_name}</div>
                  <span className="text-xs font-semibold text-slate-500">{selectedListId === list.id ? "Open" : "View / edit →"}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {list.list_type} · {list.status} · v{list.version}
                  {list.effective_from || list.effective_to ? ` · ${list.effective_from || "…"} – ${list.effective_to || "open"}` : ""}
                  {list.is_company_default ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">Company default</span> : null}
                </div>
              </button>
            ))}
          </div>
        </div>


      {selectedListId ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Price list details">
          {detailLoading && !detail ? <p className="text-sm text-slate-500">Opening price list…</p> : null}
          {detailError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{detailError}</div> : null}

          {detail ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{detail.list.list_name}</h2>
                  <div className="mt-1 text-xs text-slate-500">
                    {detail.list.list_type} · {detail.list.status} · v{detail.list.version}
                    {detail.list.effective_from || detail.list.effective_to
                      ? ` · Effective ${detail.list.effective_from || "…"} to ${detail.list.effective_to || "open"}`
                      : " · No end date"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleCompanyDefault(detail.list.id, !detail.list.is_company_default)}
                  title="Customers without a price list are invoiced from the company default list. Once one is set, a product on no applicable list has no price until it is added."
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                >
                  {detail.list.is_company_default ? "Company default ✓ — clear" : "Make company default"}
                </button>
                <div className="text-right text-xs text-slate-500">
                  <div><span className="font-semibold text-slate-900">{activeItems.length}</span> active product{activeItems.length === 1 ? "" : "s"}</div>
                  {inactiveItems.length ? <div>{inactiveItems.length} removed</div> : null}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-900">Customers on this list: </span>
                {detail.assignedCustomers.length
                  ? detail.assignedCustomers.map((c, i) => (
                      <span key={c.customerId}>
                        {i ? " · " : ""}
                        <button
                          type="button"
                          onClick={() => {
                            setOpenCustomerId(c.customerId);
                            setTab("customers");
                          }}
                          className="font-semibold text-slate-800 underline decoration-slate-300 hover:decoration-slate-700"
                        >
                          {c.customerName}
                        </button>
                        {` (${c.role}${c.status === "Active" ? "" : `, ${c.status}`})`}
                      </span>
                    ))
                  : detail.list.is_company_default
                    ? "none assigned directly — as the company default it prices every customer without a list"
                    : "none yet"}
                <span className="text-slate-500"> — assign lists to a customer in Customer Pricing.</span>
              </div>

              <h3 className="mt-5 text-sm font-semibold text-slate-900">Add a product to this list</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
                <div className="relative">
                  <input
                    value={productQuery}
                    onChange={(e) => {
                      setProductQuery(e.target.value);
                      setAddProduct(null);
                    }}
                    placeholder="Search products by name or SKU"
                    aria-label="Search products"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  {shownResults.length ? (
                    <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {shownResults.map((result) => {
                        const already = detail.items.find((item) => item.productId === result.id);
                        return (
                          <button
                            key={result.id}
                            type="button"
                            onClick={() => {
                              setAddProduct(result);
                              setProductQuery(result.product_name);
                              setSearchResults([]);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                          >
                            <span className="font-semibold text-slate-900">{result.product_name}</span>
                            {result.sku ? <span className="text-slate-500"> ({result.sku})</span> : null}
                            {already ? <span className="ml-2 text-xs text-slate-500">{already.status === "Active" ? "already on list" : "removed — will be restored"}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {searching && searchActive ? <div className="mt-1 text-xs text-slate-500">Searching…</div> : null}
                </div>
                <input
                  value={addPrice}
                  onChange={(e) => setAddPrice(e.target.value)}
                  placeholder="List price"
                  inputMode="decimal"
                  aria-label="List price"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => void addProductToList()} disabled={busy || !addProduct} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  Add to list
                </button>
              </div>

              <div className="mt-5 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Products on this list</h3>
                {inactiveItems.length ? (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                    Show removed products
                  </label>
                ) : null}
              </div>
              <EnterpriseScrollContainer className="mt-2">
                {/* A deliberate scroll region on phones: columns keep usable widths; desktop is wider than this. */}
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Product</th>
                      <th className="px-2 py-2">SKU</th>
                      <th className="px-2 py-2">List Price</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Effective</th>
                      <th className="px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.length === 0 ? (
                      <tr className="border-t border-slate-100">
                        <td colSpan={6} className="px-2 py-4 text-center text-sm text-slate-500">
                          No products on this list yet. Customers assigned only to this list will see an empty catalogue.
                        </td>
                      </tr>
                    ) : null}
                    {visibleItems.map((item) => {
                      const draft = priceDrafts[item.id];
                      const changed = draft !== undefined && draft.trim() !== "" && Number(draft) !== item.finalPrice;
                      return (
                        <tr key={item.id} className={`border-t border-slate-100 ${item.status === "Inactive" ? "text-slate-400" : ""}`}>
                          <td className="min-w-[10rem] px-2 py-2 font-semibold">{item.productName}</td>
                          <td className="whitespace-nowrap px-2 py-2">{item.sku || "-"}</td>
                          <td className="px-2 py-2">
                            {item.status === "Active" ? (
                              <input
                                value={draft ?? String(item.finalPrice)}
                                onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && changed) void saveItemPrice(item);
                                }}
                                inputMode="decimal"
                                aria-label={`Price for ${item.productName}`}
                                className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                              />
                            ) : (
                              money(item.finalPrice)
                            )}
                          </td>
                          <td className="px-2 py-2">{item.status === "Active" ? "Active" : "Removed"}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-xs">
                            {item.effectiveFrom || item.effectiveTo ? `${item.effectiveFrom || "…"} – ${item.effectiveTo || "open"}` : "Always"}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              {item.status === "Active" ? (
                                <>
                                  {changed ? (
                                    <button type="button" onClick={() => void saveItemPrice(item)} disabled={busy} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">
                                      Save
                                    </button>
                                  ) : null}
                                  <button type="button" onClick={() => void setItemStatus(item, "Inactive")} disabled={busy} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60">
                                    Remove
                                  </button>
                                </>
                              ) : (
                                <button type="button" onClick={() => void setItemStatus(item, "Active")} disabled={busy} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60">
                                  Restore
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </EnterpriseScrollContainer>

              {detail.history.length ? (
                <div className="mt-4">
                  <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-xs font-semibold text-slate-600">
                    {showHistory ? "Hide recent changes" : `Show recent changes (${detail.history.length})`}
                  </button>
                  {showHistory ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {detail.history.map((entry, index) => (
                        <li key={`${entry.at}-${index}`}>
                          <span className="text-slate-500">{entry.at.slice(0, 16).replace("T", " ")}</span> · <span className="font-semibold text-slate-900">{entry.event}</span>
                          {entry.detail ? ` — ${entry.detail}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <details className="mt-4 rounded-xl border border-slate-200 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">Calculated price (base price, markup, discount, GP) for this list</summary>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <select value={lineProductId} onChange={(e) => setLineProductId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2">
                      <option value="">Select product</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.product_name}{product.sku ? ` (${product.sku})` : ""}</option>
                      ))}
                    </select>
                    <input value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="Base price" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input value={markupPct} onChange={(e) => setMarkupPct(e.target.value)} placeholder="Markup %" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} placeholder="Discount %" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input value={gpPct} onChange={(e) => setGpPct(e.target.value)} placeholder="GP %" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} placeholder="Override price (optional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
                    <button type="button" onClick={() => void addItem()} disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2">Save Product Price</button>
                  </div>
              </details>
            </>
          ) : null}
        </div>
      ) : null}
      </section>

      </div>
      )}
    </div>
  );
}
