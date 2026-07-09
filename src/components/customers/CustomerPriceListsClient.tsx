"use client";

import { useEffect, useMemo, useState } from "react";

type PriceList = {
  id: string;
  list_name: string;
  list_type: "Standard" | "Contract";
  status: "Active" | "Inactive";
  version: number;
};

type Product = { id: string; product_name: string; sku?: string | null };
type Customer = { id: string; customer_name: string; customer_code?: string | null };

type Assignment = {
  id: string;
  customer_id: string;
  default_price_list_id: string | null;
  contract_price_list_id: string | null;
  status: "Active" | "Inactive";
};

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

  const [assignCustomerId, setAssignCustomerId] = useState("");
  const [assignDefaultList, setAssignDefaultList] = useState("");
  const [assignContractList, setAssignContractList] = useState("");

  const customerById = useMemo(() => new Map(customers.map((item) => [item.id, item])), [customers]);
  const listById = useMemo(() => new Map(lists.map((item) => [item.id, item])), [lists]);

  async function loadData() {
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
      setSelectedListId(String(listData.lists[0].id));
    }
  }

  useEffect(() => {
    void loadData().catch((e) => setError(e instanceof Error ? e.message : "Load failed."));
  }, []);

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
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Create list failed.");
      setMessage("Price list created.");
      setNewListName("");
      await loadData();
      setSelectedListId(String(data.list?.id || selectedListId));
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add item failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment() {
    if (!assignCustomerId) {
      setError("Customer is required.");
      return;
    }
    if (!assignDefaultList && !assignContractList) {
      setError("Select at least one price list.");
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
          mode: "assign",
          customerId: assignCustomerId,
          defaultPriceListId: assignDefaultList || null,
          contractPriceListId: assignContractList || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Assignment failed.");
      setMessage("Customer assignment saved.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assignment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div> : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-bold text-slate-900">Create Price List</h2>
          <div className="mt-3 grid gap-2">
            <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="List name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={newListType} onChange={(e) => setNewListType(e.target.value === "Contract" ? "Contract" : "Standard")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="Standard">Standard</option>
              <option value="Contract">Contract</option>
            </select>
            <button type="button" onClick={() => void createList()} disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Create</button>
          </div>

          <h3 className="mt-5 text-sm font-semibold text-slate-900">Available Lists</h3>
          <div className="mt-2 space-y-2">
            {lists.map((list) => (
              <button key={list.id} type="button" onClick={() => setSelectedListId(list.id)} className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedListId === list.id ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                <div className="font-semibold text-slate-900">{list.list_name}</div>
                <div className="text-xs text-slate-500">{list.list_type} · {list.status} · v{list.version}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-bold text-slate-900">Add Product Pricing</h2>
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
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold text-slate-900">Assign Lists to Customers</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select value={assignCustomerId} onChange={(e) => setAssignCustomerId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.customer_name}{customer.customer_code ? ` (${customer.customer_code})` : ""}</option>
            ))}
          </select>
          <select value={assignDefaultList} onChange={(e) => setAssignDefaultList(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Default list</option>
            {lists.filter((list) => list.list_type === "Standard").map((list) => (
              <option key={list.id} value={list.id}>{list.list_name}</option>
            ))}
          </select>
          <select value={assignContractList} onChange={(e) => setAssignContractList(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Contract list</option>
            {lists.filter((list) => list.list_type === "Contract").map((list) => (
              <option key={list.id} value={list.id}>{list.list_name}</option>
            ))}
          </select>
        </div>
        <button type="button" onClick={() => void saveAssignment()} disabled={busy} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Save Assignment</button>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Default List</th>
                <th className="px-2 py-2">Contract List</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id} className="border-t border-slate-100">
                  <td className="px-2 py-2">{customerById.get(assignment.customer_id)?.customer_name || assignment.customer_id}</td>
                  <td className="px-2 py-2">{assignment.default_price_list_id ? listById.get(assignment.default_price_list_id)?.list_name || assignment.default_price_list_id : "-"}</td>
                  <td className="px-2 py-2">{assignment.contract_price_list_id ? listById.get(assignment.contract_price_list_id)?.list_name || assignment.contract_price_list_id : "-"}</td>
                  <td className="px-2 py-2">{assignment.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
