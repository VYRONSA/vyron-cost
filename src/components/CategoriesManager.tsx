"use client";

import { Edit3, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import StatusPill from "@/components/StatusPill";
import { Category, statusTone } from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";
import {
  filterXeroAccountsForRole,
  type XeroAccountCatalogEntry,
  type XeroAccountMapping,
  type XeroAccountRole,
} from "@/lib/vyron-xero-integration";

const emptyForm = { category_name: "", category_type: "Product", description: "", status: "Active" };
const emptyMapping: XeroAccountMapping = {
  salesAccount: "",
  costOfSalesAccount: "",
  inventoryAssetAccount: "",
  wipAccount: "",
  packagingAccount: "",
  manufacturingVarianceAccount: "",
  stockAdjustmentAccount: "",
  freightIncomeAccount: "",
  freightExpenseAccount: "",
  vatStandard: "",
  zeroRated: "",
  exempt: "",
};

const PRODUCT_FINANCIAL_FIELDS: Array<{ key: keyof XeroAccountMapping; role: XeroAccountRole; label: string }> = [
  { key: "salesAccount", role: "salesAccount", label: "Sales Account" },
  { key: "costOfSalesAccount", role: "costOfSalesAccount", label: "Cost of Sales Account" },
  { key: "inventoryAssetAccount", role: "inventoryAssetAccount", label: "Inventory Asset Account" },
  { key: "wipAccount", role: "wipAccount", label: "WIP Account" },
  { key: "manufacturingVarianceAccount", role: "manufacturingVarianceAccount", label: "Manufacturing Variance Account" },
  { key: "stockAdjustmentAccount", role: "stockAdjustmentAccount", label: "Stock Adjustment Account" },
  { key: "freightIncomeAccount", role: "freightIncomeAccount", label: "Freight Income Account" },
  { key: "freightExpenseAccount", role: "freightExpenseAccount", label: "Freight Expense Account" },
];

function pickAccountCodeFromCategoryValue(
  categoryValue: string | null | undefined,
  accounts: XeroAccountCatalogEntry[]
) {
  const raw = String(categoryValue || "").trim();
  if (!raw) return "";
  const account =
    accounts.find((entry) => entry.accountId === raw) ||
    accounts.find((entry) => entry.accountCode === raw);
  return account?.accountCode || "";
}

type CategoryFinancialFields = {
  financial_sales_account_id?: string | null;
  financial_cost_of_sales_account_id?: string | null;
  financial_inventory_asset_account_id?: string | null;
  financial_wip_account_id?: string | null;
  financial_manufacturing_variance_account_id?: string | null;
  financial_stock_adjustment_account_id?: string | null;
  financial_freight_income_account_id?: string | null;
  financial_freight_expense_account_id?: string | null;
  financial_vat_tax_type?: string | null;
};

export default function CategoriesManager({ initialCategories, companyId }: { initialCategories: Category[]; companyId: string }) {
  const [categories, setCategories] = useState(initialCategories);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [financialMapping, setFinancialMapping] = useState<XeroAccountMapping>(emptyMapping);
  const [accountCatalog, setAccountCatalog] = useState<XeroAccountCatalogEntry[]>([]);
  const [taxTypes, setTaxTypes] = useState<string[]>([]);
  const [savingFinancial, setSavingFinancial] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/integrations/xero/accounts", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (!data?.ok) return;
        setAccountCatalog(Array.isArray(data.accountCatalog?.accounts) ? data.accountCatalog.accounts : []);
        setTaxTypes(Array.isArray(data.taxTypes) ? data.taxTypes : []);
      })
      .catch(() => {
        setAccountCatalog([]);
        setTaxTypes([]);
      });
  }, []);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return categories;
    return categories.filter((category) => [category.category_name, category.category_type, category.description || "", category.status].join(" ").toLowerCase().includes(term));
  }, [categories, search]);

  function updateForm(field: keyof typeof emptyForm, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  function updateMapping(field: keyof XeroAccountMapping, value: string) { setFinancialMapping((current) => ({ ...current, [field]: value })); }
  function accountOptionsForRole(role: XeroAccountRole) { return filterXeroAccountsForRole(accountCatalog, role); }
  function resetForm() {
    setForm(emptyForm);
    setFinancialMapping(emptyMapping);
    setEditingId(null);
    setMessage("");
  }
  function startEdit(category: Category) {
    setEditingId(category.id);
    setForm({ category_name: category.category_name, category_type: category.category_type, description: category.description || "", status: category.status });
    setFinancialMapping({
      ...emptyMapping,
      salesAccount: pickAccountCodeFromCategoryValue(category.financial_sales_account_id, accountCatalog),
      costOfSalesAccount: pickAccountCodeFromCategoryValue(category.financial_cost_of_sales_account_id, accountCatalog),
      inventoryAssetAccount: pickAccountCodeFromCategoryValue(category.financial_inventory_asset_account_id, accountCatalog),
      wipAccount: pickAccountCodeFromCategoryValue(category.financial_wip_account_id, accountCatalog),
      manufacturingVarianceAccount: pickAccountCodeFromCategoryValue(category.financial_manufacturing_variance_account_id, accountCatalog),
      stockAdjustmentAccount: pickAccountCodeFromCategoryValue(category.financial_stock_adjustment_account_id, accountCatalog),
      freightIncomeAccount: pickAccountCodeFromCategoryValue(category.financial_freight_income_account_id, accountCatalog),
      freightExpenseAccount: pickAccountCodeFromCategoryValue(category.financial_freight_expense_account_id, accountCatalog),
      vatStandard: String(category.financial_vat_tax_type || ""),
    });
    setMessage(`Editing ${category.category_name}`);
  }

  async function saveCategoryFinancialMapping(categoryName: string): Promise<CategoryFinancialFields | false> {
    if (form.category_type !== "Product") return {};
    setSavingFinancial(true);
    try {
      const response = await fetch("/api/integrations/xero/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-category", categoryName, mapping: financialMapping }),
      });
      const data = await response.json();
      if (!data?.ok) {
        setMessage(data?.error || "Could not save financial mapping.");
        return false;
      }
      return (data.mapping || {}) as CategoryFinancialFields;
    } catch {
      setMessage("Could not save financial mapping.");
      return false;
    } finally {
      setSavingFinancial(false);
    }
  }

  async function saveCategory() {
    if (!form.category_name.trim()) { setMessage("Please enter a category name."); return; }
    const normalizedCategoryName = form.category_name.trim();
    const payload = { company_id: companyId, category_name: normalizedCategoryName, category_type: form.category_type, description: form.description || null, status: form.status };
    if (editingId) {
      if (supabase && companyId !== "demo-company" && !editingId.startsWith("cat")) {
        const { data, error } = await supabase.from("vyron_cost_categories").update(payload).eq("id", editingId).select("*").single();
        if (error || !data) { setMessage(error?.message || "Could not update category."); return; }
        const savedFinancial = await saveCategoryFinancialMapping(normalizedCategoryName);
        if (savedFinancial === false) return;
        const next = { ...(data as Category), ...savedFinancial } as Category;
        setCategories((current) => current.map((item) => (item.id === editingId ? next : item)));
      } else {
        setCategories((current) => current.map((item) => (item.id === editingId ? ({ ...item, ...payload } as Category) : item)));
      }
      resetForm(); setMessage("Category updated."); return;
    }
    if (supabase && companyId !== "demo-company") {
      const { data, error } = await supabase.from("vyron_cost_categories").insert(payload).select("*").single();
      if (error || !data) { setMessage(error?.message || "Could not save category."); return; }
      const savedFinancial = await saveCategoryFinancialMapping(normalizedCategoryName);
      if (savedFinancial === false) return;
      const next = { ...(data as Category), ...savedFinancial } as Category;
      setCategories((current) => [...current, next].sort((a, b) => a.category_name.localeCompare(b.category_name)));
    } else {
      setCategories((current) => [...current, { id: crypto.randomUUID(), ...payload } as Category].sort((a, b) => a.category_name.localeCompare(b.category_name)));
    }
    resetForm(); setMessage("Category added.");
  }

  async function deleteCategory(id: string) {
    setCategories((current) => current.filter((item) => item.id !== id));
    if (supabase && !id.startsWith("cat")) await supabase.from("vyron_cost_categories").delete().eq("id", id);
  }

  function renderAccountSelector(role: XeroAccountRole, value: string, onChange: (next: string) => void) {
    const options = accountOptionsForRole(role);
    const current = String(value || "").trim();
    const hasCurrent = current ? options.some((option) => option.accountCode === current) : false;

    return (
      <select
        value={current}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400"
      >
        <option value="">Select account</option>
        {current && !hasCurrent ? <option value={current}>Current: {current}</option> : null}
        {options.map((account) => (
          <option key={`${role}-${account.accountCode}-${account.accountId}`} value={account.accountCode}>
            {account.accountCode} - {account.accountName}
            {account.accountType ? ` (${account.accountType})` : ""}
          </option>
        ))}
      </select>
    );
  }

  function renderTaxTypeSelector(value: string, onChange: (next: string) => void) {
    const current = String(value || "").trim();
    const hasCurrent = current ? taxTypes.includes(current) : false;
    return (
      <select
        value={current}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400"
      >
        <option value="">{taxTypes.length > 0 ? "Select VAT tax type" : "No synced VAT tax types"}</option>
        {current && !hasCurrent ? <option value={current}>Current: {current}</option> : null}
        {taxTypes.map((taxType) => (
          <option key={taxType} value={taxType}>{taxType}</option>
        ))}
      </select>
    );
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
          {form.category_type === "Product" && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-[0.08em] text-slate-700">Financial Mapping</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Phase 3: Product Category mapping is primary. Company defaults are fallback.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {PRODUCT_FINANCIAL_FIELDS.map((field) => (
                  <label key={field.key} className="text-xs font-black uppercase tracking-[0.05em] text-slate-600">
                    {field.label}
                    {renderAccountSelector(field.role, String(financialMapping[field.key] || ""), (next) => updateMapping(field.key, next))}
                  </label>
                ))}
                <label className="text-xs font-black uppercase tracking-[0.05em] text-slate-600">
                  VAT Tax Type
                  {renderTaxTypeSelector(financialMapping.vatStandard || "", (next) => updateMapping("vatStandard", next))}
                </label>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3"><button type="button" onClick={saveCategory} className="inline-flex items-center gap-2 rounded-2xl border border-[#A3E635]/30 bg-[#24183F] px-5 py-4 text-sm font-black text-[#F8FAFC]"><Save size={18} />{editingId ? "Update Category" : "Save Category"}</button>{editingId && <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-5 py-4 text-sm font-black text-slate-700"><X size={18} />Cancel</button>}</div>
          {(message || savingFinancial) && <div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 px-4 py-3 text-sm font-bold text-[#65A30D]">{savingFinancial ? "Saving category financial mapping..." : message}</div>}
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
