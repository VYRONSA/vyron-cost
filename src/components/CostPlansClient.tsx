"use client";

import { Edit3, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import StatusPill from "@/components/StatusPill";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { formatMoney } from "@/lib/vyron-cost-data";
import { CostPlan, formatPlanImpact, recalculateCostPlan } from "@/lib/vyron-cost-plans-data";

const emptyPlan = (): CostPlan => ({
  id: crypto.randomUUID(),
  scenario_name: "New cost scenario",
  product_name: "Unassigned product",
  category: "General",
  planned_cost: 0,
  current_cost: 0,
  variance: 0,
  target_gp: 40,
  current_selling_price: 0,
  suggested_selling_price: 0,
  supplier_increase_pct: 4,
  labour_increase_pct: 2,
  packaging_increase_pct: 3,
  status: "Draft",
});

export default function CostPlansClient({ initialPlans }: { initialPlans: CostPlan[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CostPlan | null>(null);
  const [message, setMessage] = useState("");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(plans.map((plan) => plan.category))).sort()],
    [plans]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return plans.filter((plan) => {
      const matchesSearch =
        !term ||
        [plan.scenario_name, plan.product_name, plan.category, plan.status].join(" ").toLowerCase().includes(term);
      const matchesCategory = categoryFilter === "All" || plan.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [plans, search, categoryFilter]);

  function startEdit(plan: CostPlan) {
    setEditingId(plan.id);
    setDraft({ ...plan });
  }

  function saveEdit() {
    if (!draft) return;
    const next = recalculateCostPlan(draft);
    setPlans((current) => current.map((plan) => (plan.id === next.id ? next : plan)));
    setEditingId(null);
    setDraft(null);
    setMessage("Cost plan updated.");
  }

  function addPlan() {
    const plan = recalculateCostPlan(emptyPlan());
    setPlans((current) => [plan, ...current]);
    startEdit(plan);
  }

  function deletePlan(id: string) {
    setPlans((current) => current.filter((plan) => plan.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setDraft(null);
    }
    setMessage("Cost plan deleted.");
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Cost Planning",
        title: "Cost Planning Intelligence Centre",
        subtitle: "Model scenario-driven cost and price impacts with guided editing and review controls.",
        outcomes: ["Build actionable cost scenarios", "Project suggested selling prices", "Compare planned and current margin pressure"],
        formulas: ["Planned Cost = Current Cost x (1 + Supplier% + Labour% + Packaging%)", "Variance = Planned Cost - Current Cost", "Suggested Price aligns target GP to planned cost"],
        intelligenceItems: [
          { label: "Scenario library", detail: `${plans.length} cost plans loaded` },
          { label: "Filtered set", detail: `${filtered.length} plans in current view` },
          { label: "Category filter", detail: categoryFilter },
        ],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-black text-[#F8FAFC]">Cost Plans</h2>
            <p className="mt-2 text-sm text-slate-500">BOM-linked planned vs actual cost, variance and suggested selling price.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black"
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            <button type="button" onClick={addPlan} className="inline-flex items-center gap-2 rounded-2xl border border-[#A855F7]/30 bg-[#24183F] px-5 py-3 text-sm font-black text-[#F8FAFC]">
              <Plus size={16} />
              Create plan
            </button>
          </div>
        </div>

        <SearchFilterBar value={search} onChange={setSearch} placeholder="Search scenarios, products, categories..." resultCount={filtered.length} />

        <div className="overflow-x-auto rounded-3xl border border-slate-100">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-7 bg-[#08111A] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#B6D934]">
              <div className="col-span-2">Scenario</div>
              <div>Current</div>
              <div>Planned</div>
              <div>Variance</div>
              <div>Suggested Price</div>
              <div>Actions</div>
            </div>
            {filtered.map((plan) => (
              <div key={plan.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-4 text-sm">
                <div className="col-span-2">
                  <div className="font-black text-[#F8FAFC]">{plan.scenario_name}</div>
                  <div className="text-xs text-slate-500">
                    {plan.product_name} · {plan.category}
                  </div>
                </div>
                <div>{formatMoney(plan.current_cost)}</div>
                <div className="font-black text-violet-700">{formatMoney(plan.planned_cost)}</div>
                <div className="font-black text-red-600">{formatMoney(plan.variance)}</div>
                <div>{formatMoney(plan.suggested_selling_price)}</div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => startEdit(plan)} className="inline-flex items-center gap-1 rounded-full border border-[#A855F7]/25 bg-[#A855F7]/10 px-3 py-2 text-xs font-black text-[#7E22CE]">
                    <Edit3 size={14} />
                    Edit
                  </button>
                  <button type="button" onClick={() => deletePlan(plan.id)} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h3 className="text-xl font-black text-[#F8FAFC]">{draft ? "Edit Scenario" : "Scenario Builder"}</h3>
        {!draft ? (
          <p className="mt-4 text-sm text-slate-500">Select a cost plan to review BOM cost impact, supplier movement, labour movement and packaging movement.</p>
        ) : (
          <div className="mt-5 grid gap-4">
            <label className="text-sm font-black text-slate-600">
              Scenario name
              <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={draft.scenario_name} onChange={(e) => setDraft({ ...draft, scenario_name: e.target.value })} />
            </label>
            <label className="text-sm font-black text-slate-600">
              Product name
              <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={draft.product_name} onChange={(e) => setDraft({ ...draft, product_name: e.target.value })} />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs font-black text-slate-500">
                Supplier %
                <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-bold" value={draft.supplier_increase_pct} onChange={(e) => setDraft(recalculateCostPlan({ ...draft, supplier_increase_pct: Number(e.target.value) }))} />
              </label>
              <label className="text-xs font-black text-slate-500">
                Labour %
                <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-bold" value={draft.labour_increase_pct} onChange={(e) => setDraft(recalculateCostPlan({ ...draft, labour_increase_pct: Number(e.target.value) }))} />
              </label>
              <label className="text-xs font-black text-slate-500">
                Packaging %
                <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-bold" value={draft.packaging_increase_pct} onChange={(e) => setDraft(recalculateCostPlan({ ...draft, packaging_increase_pct: Number(e.target.value) }))} />
              </label>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm">
              <div className="mb-3 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-600">
                Formula: Planned Cost = Current BOM Cost × (1 + Supplier% + Labour% + Packaging%)
              </div>
              <div className="flex justify-between"><span>Planned cost</span><span className="font-black">{formatMoney(draft.planned_cost)}</span></div>
              <div className="mt-2 flex justify-between"><span>Suggested price</span><span className="font-black text-violet-700">{formatMoney(draft.suggested_selling_price)}</span></div>
              <div className="mt-2 flex justify-between"><span>Impact</span><span className="font-black">{formatPlanImpact(draft)}</span></div>
              <div className="mt-3"><StatusPill tone={draft.status === "Review" ? "amber" : "emerald"}>{draft.status}</StatusPill></div>
            </div>
            {draft.product_id ? (
              <Link href={`/products/${draft.product_id}`} className="text-sm font-black text-[#7E22CE]">
                Open affected product →
              </Link>
            ) : null}
            <button type="button" onClick={saveEdit} className="rounded-2xl bg-[#08111A] px-5 py-3 text-sm font-black text-[#B6D934]">
              Save scenario
            </button>
          </div>
        )}
        {message ? <div className="mt-4 rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3 text-sm font-black text-[#7E22CE]">{message}</div> : null}
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
