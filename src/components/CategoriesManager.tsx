"use client";

import { Edit3, Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import StatusPill from "@/components/StatusPill";
import { Category, statusTone } from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";

const emptyForm = { category_name: "", category_type: "Product", description: "", status: "Active" };

export default function CategoriesManager({ initialCategories, companyId }: { initialCategories: Category[]; companyId: string }) {
  const [categories, setCategories] = useState(initialCategories);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return categories;
    return categories.filter((category) => [category.category_name, category.category_type, category.description || "", category.status].join(" ").toLowerCase().includes(term));
  }, [categories, search]);

  function updateForm(field: keyof typeof emptyForm, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  function resetForm() { setForm(emptyForm); setEditingId(null); setMessage(""); }
  function startEdit(category: Category) {
    setEditingId(category.id);
    setForm({ category_name: category.category_name, category_type: category.category_type, description: category.description || "", status: category.status });
    setMessage(`Editing ${category.category_name}`);
  }

  async function saveCategory() {
    if (!form.category_name.trim()) { setMessage("Please enter a category name."); return; }
    const payload = { company_id: companyId, category_name: form.category_name.trim(), category_type: form.category_type, description: form.description || null, status: form.status };
    if (editingId) {
      if (supabase && companyId !== "demo-company" && !editingId.startsWith("cat")) {
        const { data, error } = await supabase.from("vyron_cost_categories").update(payload).eq("id", editingId).select("*").single();
        if (error || !data) { setMessage(error?.message || "Could not update category."); return; }
        setCategories((current) => current.map((item) => (item.id === editingId ? (data as Category) : item)));
      } else {
        setCategories((current) => current.map((item) => (item.id === editingId ? ({ ...item, ...payload } as Category) : item)));
      }
      resetForm(); setMessage("Category updated."); return;
    }
    if (supabase && companyId !== "demo-company") {
      const { data, error } = await supabase.from("vyron_cost_categories").insert(payload).select("*").single();
      if (error || !data) { setMessage(error?.message || "Could not save category."); return; }
      setCategories((current) => [...current, data as Category].sort((a, b) => a.category_name.localeCompare(b.category_name)));
    } else {
      setCategories((current) => [...current, { id: crypto.randomUUID(), ...payload } as Category].sort((a, b) => a.category_name.localeCompare(b.category_name)));
    }
    resetForm(); setMessage("Category added.");
  }

  async function deleteCategory(id: string) {
    setCategories((current) => current.filter((item) => item.id !== id));
    if (supabase && !id.startsWith("cat")) await supabase.from("vyron_cost_categories").delete().eq("id", id);
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.5fr]">
      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 p-3 text-[#84CC16]">{editingId ? <Edit3 size={20} /> : <Plus size={20} />}</div>
          <div><h2 className="text-2xl font-black text-[#F8FAFC]">{editingId ? "Edit Category" : "Create Category"}</h2><p className="text-sm text-slate-500">Use categories across products, ingredients, suppliers, recipes and costings.</p></div>
        </div>
        <div className="grid gap-4">
          <label className="text-sm font-black text-slate-600">Category Name<input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.category_name} onChange={(e) => updateForm("category_name", e.target.value)} /></label>
          <label className="text-sm font-black text-slate-600">Category Type<select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.category_type} onChange={(e) => updateForm("category_type", e.target.value)}><option>Product</option><option>Ingredient</option><option>Supplier</option><option>Recipe</option><option>Costing</option><option>Report</option></select></label>
          <label className="text-sm font-black text-slate-600">Status<select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.status} onChange={(e) => updateForm("status", e.target.value)}><option>Active</option><option>Review</option><option>Inactive</option></select></label>
          <label className="text-sm font-black text-slate-600">Description<textarea className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.description} onChange={(e) => updateForm("description", e.target.value)} /></label>
          <div className="flex flex-wrap gap-3"><button type="button" onClick={saveCategory} className="inline-flex items-center gap-2 rounded-2xl border border-[#A3E635]/30 bg-[#24183F] px-5 py-4 text-sm font-black text-[#F8FAFC]"><Save size={18} />{editingId ? "Update Category" : "Save Category"}</button>{editingId && <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-5 py-4 text-sm font-black text-slate-700"><X size={18} />Cancel</button>}</div>
          {message && <div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 px-4 py-3 text-sm font-bold text-[#65A30D]">{message}</div>}
        </div>
      </div>
      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-2xl font-black text-[#F8FAFC]">Category Register</h2><p className="mt-2 text-sm text-slate-500">Search, edit, delete and control category groups.</p>
        <div className="mt-5"><SearchFilterBar value={search} onChange={setSearch} placeholder="Search categories by name, type, status or description..." /></div>
        <div className="overflow-x-auto rounded-3xl border border-slate-100"><div className="min-w-[900px]"><div className="grid grid-cols-6 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]"><div>Name</div><div>Type</div><div>Description</div><div>Status</div><div>Edit</div><div>Delete</div></div>{filtered.map((category) => (<div key={category.id} className="grid grid-cols-6 items-center border-t border-slate-100 px-5 py-5 text-sm"><div className="font-black text-[#F8FAFC]">{category.category_name}</div><div className="font-bold text-slate-600">{category.category_type}</div><div className="text-slate-500">{category.description || "No description"}</div><div><StatusPill tone={statusTone(category.status)}>{category.status}</StatusPill></div><div><button type="button" onClick={() => startEdit(category)} className="inline-flex items-center gap-2 rounded-full border border-[#A3E635]/25 bg-[#A3E635]/10 px-3 py-2 text-xs font-black text-[#65A30D]"><Edit3 size={14} />Edit</button></div><div><button type="button" onClick={() => deleteCategory(category.id)} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700"><Trash2 size={14} />Delete</button></div></div>))}</div></div>
      </div>
    </section>
  );
}
