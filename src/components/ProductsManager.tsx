"use client";

import { Edit3, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import PaginatedTableControls from "@/components/PaginatedTableControls";
import SearchFilterBar from "@/components/SearchFilterBar";
import StatusPill from "@/components/StatusPill";
import {
  calculateGpPercent,
  formatMoney,
  Product,
} from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 50;

const emptyForm = {
  product_name: "",
  category: "Sushi",
  selling_price: "0",
  total_cost: "0",
  target_gp: "40",
};

export default function ProductsManager({
  initialProducts,
  companyId,
}: {
  initialProducts: Product[];
  companyId: string;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((product) => product.category))).sort()],
    [products]
  );

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = categoryFilter === "All" || product.category === categoryFilter;
      if (!matchesCategory) return false;
      if (!term) return true;
      return (
      [
        product.product_name,
        product.category,
        product.status || "",
        String(product.selling_price),
        String(product.total_cost),
        String(product.target_gp),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
      );
    });
  }, [products, search, categoryFilter]);

  const pageCount = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const visibleProducts = filteredProducts.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(0);
  }

  function updateForm(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function addProduct() {
    if (!form.product_name.trim()) {
      setMessage("Please enter a product name.");
      return;
    }

    const payload = {
      company_id: companyId,
      product_name: form.product_name.trim(),
      category: form.category,
      selling_price: Number(form.selling_price),
      total_cost: Number(form.total_cost),
      target_gp: Number(form.target_gp),
    };

    if (supabase && companyId !== "demo-company") {
      const { data, error } = await supabase.from("vyron_cost_products").insert(payload).select("*").single();

      if (error || !data) {
        setMessage(error?.message || "Could not save product.");
        return;
      }

      setProducts((current) =>
        [...current, data as Product].sort((a, b) => a.product_name.localeCompare(b.product_name))
      );
    } else {
      setProducts((current) =>
        [
          ...current,
          {
            id: crypto.randomUUID(),
            ...payload,
          } as Product,
        ].sort((a, b) => a.product_name.localeCompare(b.product_name))
      );
    }

    setForm(emptyForm);
    setMessage("Product added.");
  }

  async function deleteProduct(id: string) {
    setProducts((current) => current.filter((item) => item.id !== id));

    if (supabase && !id.startsWith("product")) {
      await supabase.from("vyron_cost_products").delete().eq("id", id);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.5fr]">
      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 p-3 text-[#84CC16]"><Plus size={20} /></div>
          <div>
            <h2 className="text-2xl font-black text-[#F8FAFC]">Add Product</h2>
            <p className="text-sm text-slate-500">Fast product creation.</p>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="text-sm font-black text-slate-600">
            Product Name
            <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.product_name} onChange={(event) => updateForm("product_name", event.target.value)} />
          </label>

          <label className="text-sm font-black text-slate-600">
            Category
            <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.category} onChange={(event) => updateForm("category", event.target.value)} />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-black text-slate-600">
              Selling Price
              <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.selling_price} onChange={(event) => updateForm("selling_price", event.target.value)} />
            </label>

            <label className="text-sm font-black text-slate-600">
              Total Cost
              <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.total_cost} onChange={(event) => updateForm("total_cost", event.target.value)} />
            </label>
          </div>

          <button type="button" onClick={addProduct} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#A3E635]/30 bg-[#24183F] px-5 py-4 text-sm font-black text-[#F8FAFC] transition hover:bg-[#2a2448]">
            <Plus size={18} />
            Add Product
          </button>

          {message && <div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 px-4 py-3 text-sm font-bold text-[#65A30D]">{message}</div>}
        </div>
      </div>

      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-[#F8FAFC]">Products</h2>
          <p className="mt-2 text-sm text-slate-500">Showing 50 records per page.</p>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <select
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
              setPage(0);
            }}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700"
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </div>

        <SearchFilterBar
          value={search}
          onChange={updateSearch}
          placeholder="Search products..."
          resultCount={filteredProducts.length}
        />

        <div className="overflow-x-auto rounded-3xl border border-slate-100">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-8 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
              <div>Product</div><div>Category</div><div>Price</div><div>Cost</div><div>GP</div><div>Status</div><div>Edit</div><div>Delete</div>
            </div>

            {visibleProducts.map((product) => {
              const gp = calculateGpPercent(Number(product.selling_price), Number(product.total_cost));
              const tone = gp < 30 ? "red" : gp < Number(product.target_gp) ? "amber" : "emerald";
              const action = tone === "red" ? "Critical" : tone === "amber" ? "Review" : "Healthy";

              return (
                <div key={product.id} className="grid grid-cols-8 items-center border-t border-slate-100 px-5 py-5 text-sm">
                  <div>
                    <Link href={`/products/${product.id}`} className="font-black text-[#F8FAFC] hover:text-[#65A30D]">
                      {product.product_name}
                    </Link>
                  </div>
                  <div className="font-bold text-slate-600">{product.category}</div>
                  <div className="font-black">{formatMoney(Number(product.selling_price))}</div>
                  <div>{formatMoney(Number(product.total_cost))}</div>
                  <div className="font-black text-[#65A30D]">{gp.toFixed(1)}%</div>
                  <div><StatusPill tone={tone}>{action}</StatusPill></div>
                  <div>
                    <Link href={`/products/${product.id}/edit`} className="inline-flex items-center gap-2 rounded-full border border-[#A3E635]/25 bg-[#A3E635]/10 px-3 py-2 text-xs font-black text-[#65A30D]">
                      <Edit3 size={14} />
                      Edit
                    </Link>
                  </div>
                  <div>
                    <button type="button" onClick={() => deleteProduct(product.id)} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <PaginatedTableControls page={page} pageCount={pageCount} setPage={setPage} total={filteredProducts.length} />
      </div>
    </section>
  );
}
