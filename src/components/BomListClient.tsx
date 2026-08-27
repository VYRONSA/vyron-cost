"use client";

import { Copy, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { BomHeader, demoBoms, formatMoney } from "@/lib/vyron-cost-bom-data";
import { recipeToBomHeader } from "@/lib/vyron-cost-recipes-data";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import {
  VyronPremiumPageShell,
} from "@/components/vyron-premium/VyronPremiumPageShell";
import { VyronPremiumSectionHeading } from "@/components/vyron-premium/VyronPremiumSprint";

function mapRecipeRow(row: Record<string, unknown>): BomHeader {
  return recipeToBomHeader({
    id: String(row.id),
    company_id: row.company_id ? String(row.company_id) : null,
    recipe_name: String(row.recipe_name || row.bom_name || ""),
    category: row.category ? String(row.category) : null,
    yield_qty: Number(row.yield_qty || 1),
    yield_unit: row.yield_unit ? String(row.yield_unit) : "unit",
    target_gp: row.target_gp != null ? Number(row.target_gp) : null,
    selling_price: row.selling_price != null ? Number(row.selling_price) : null,
    total_cost: Number(row.total_cost || 0),
    ingredient_cost: row.ingredient_cost != null ? Number(row.ingredient_cost) : null,
    packaging_cost: row.packaging_cost != null ? Number(row.packaging_cost) : null,
    cost_per_unit: Number(row.cost_per_unit || 0),
    calculated_gp: row.calculated_gp != null ? Number(row.calculated_gp) : null,
    suggested_selling_price: row.suggested_selling_price != null ? Number(row.suggested_selling_price) : null,
    status: row.status ? String(row.status) : "Draft",
    notes: row.notes ? String(row.notes) : null,
    product_id: row.product_id ? String(row.product_id) : null,
  });
}

export default function BomListClient({
  boms: initialBoms,
  demoSeed = false,
}: {
  boms: BomHeader[];
  demoSeed?: boolean;
}) {
  const { canCreate, canDelete } = useModulePermissions("boms");
  const [items, setItems] = useState(demoSeed ? initialBoms : []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecipes = useCallback(async (showRefresh = false) => {
    const client = readActiveClient();
    const demo = isDemoWorkspace(client);
    setDemoMode(demo);

    if (demo) {
      setItems(demoBoms);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch("/api/recipes");
      const data = await response.json();
      if (data.ok && Array.isArray(data.recipes)) {
        setItems(data.recipes.map((row: Record<string, unknown>) => mapRecipeRow(row)));
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadRecipes();
  }, [loadRecipes]);

  const filtered = useMemo(() => {
    let list = items;
    if (statusFilter !== "All") {
      list = list.filter((bom) => (bom.status || "Draft") === statusFilter);
    }
    const term = search.toLowerCase().trim();
    if (!term) return list;
    return list.filter((bom) =>
      [bom.bom_name, bom.category || "", bom.status || ""].join(" ").toLowerCase().includes(term)
    );
  }, [items, search, statusFilter]);

  async function remove(id: string) {
    if (!canDelete) return;
    if (demoMode) {
      setItems((current) => current.filter((item) => item.id !== id));
      return;
    }

    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    } catch {
      void loadRecipes(true);
    }
  }

  async function duplicate(bom: BomHeader) {
    if (!canCreate) return;
    if (demoMode) {
      const copy: BomHeader = {
        ...bom,
        id: `demo-copy-${crypto.randomUUID()}`,
        bom_name: `${bom.bom_name} Copy`,
        status: "Draft",
      };
      setItems((current) => [...current, copy].sort((a, b) => a.bom_name.localeCompare(b.bom_name)));
      return;
    }

    try {
      const detailRes = await fetch(`/api/recipes/${bom.id}`);
      const detail = await detailRes.json();
      const lines = detail.ok && detail.recipe?.lines ? detail.recipe.lines : [];

      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_name: `${bom.bom_name} Copy`,
          category: bom.category,
          yield_qty: bom.yield_qty,
          yield_unit: bom.yield_unit,
          target_gp: bom.target_gp,
          selling_price: bom.selling_price,
          status: "Draft",
          notes: bom.notes,
          product_id: null,
          lines: lines.map((line: Record<string, unknown>, index: number) => ({
            line_type: line.line_type,
            ingredient_id: line.ingredient_id,
            line_name: line.line_name,
            quantity: line.quantity,
            unit: line.unit,
            unit_cost: line.unit_cost,
            wastage_percent: line.wastage_percent,
            sort_order: index,
          })),
        }),
      });
      const data = await response.json();
      if (data.ok && data.recipe) {
        setItems((current) => [...current, mapRecipeRow(data.recipe)].sort((a, b) => a.bom_name.localeCompare(b.bom_name)));
      }
    } catch {
      // ignore
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        badge: "Premium Costing Workspace",
        title: "Recipes & BOM",
        subtitle: "Create, open, duplicate and manage bill of materials — the financial blueprint behind every product margin.",
        outcomes: [
          "Build BOMs with yield and wastage discipline",
          "Link recipes to finished products",
          "Track cost per unit and target GP",
          "Duplicate proven structures across products",
        ],
        formulaEyebrow: "BOM costing",
        formulaTitle: "Core margin formulas",
        formulas: [
          { label: "Line Cost", formula: "Qty × Unit Cost × waste factor" },
          { label: "Cost / Unit", formula: "Total batch cost ÷ yield quantity" },
          { label: "GP %", formula: "(Selling Price − Cost / Unit) ÷ Selling Price × 100" },
        ],
        intelligenceEyebrow: "Cost signals",
        intelligenceTitle: "What to watch",
      }}
      showControlPanel={false}
    >
      <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <VyronPremiumSectionHeading eyebrow="BOM library" title="Recipes & BOMs" subtitle="Search, filter and open costing structures." />

        <div className="mt-5 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
            <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
              <Search size={18} className="text-violet-700" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search BOMs..." className="w-72 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400" />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-black text-violet-800 outline-none"
            >
              <option value="All">All statuses</option>
              <option>Draft</option>
              <option>Review</option>
              <option>Approved</option>
            </select>
            {!demoMode && (
              <button
                type="button"
                onClick={() => void loadRecipes(true)}
                disabled={refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-700 disabled:opacity-60"
              >
                <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            )}
            {canCreate ? (
              <Link href="/recipes/new" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white">
                <Plus size={18} />
                New BOM
              </Link>
            ) : null}
        </div>
      </div>

      {loading ? (
        <div className="rounded-[2rem] bg-white p-10 text-center text-sm font-bold text-slate-500 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          Loading recipes...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[2rem] bg-white p-10 text-center shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h3 className="text-xl font-black text-slate-900">No BOMs yet</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {search.trim()
              ? "No recipes match your search. Try a different term or create a new BOM."
              : "Create your first recipe / BOM to cost ingredients, packaging, labour and yield."}
          </p>
          {!search.trim() && canCreate ? (
            <Link href="/recipes/new" className="mt-6 inline-flex items-center gap-2 rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white">
              <Plus size={18} />
              Create first BOM
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[2rem] bg-white shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="min-w-[1040px]">
            <div className="grid grid-cols-[260px_170px_120px_130px_130px_100px_190px] bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              <div>BOM</div><div>Category</div><div>Yield</div><div>Cost / Unit</div><div>Suggested</div><div>Status</div><div>Actions</div>
            </div>

            {filtered.map((bom) => (
              <div key={bom.id} className="grid grid-cols-[260px_170px_120px_130px_130px_100px_190px] items-center border-t border-slate-100 px-5 py-4 text-sm">
                <Link href={`/recipes/${bom.id}`} className="font-black text-violet-700">{bom.bom_name}</Link>
                <div className="font-bold text-slate-500">{bom.category || "Uncategorised"}</div>
                <div className="font-bold text-slate-500">{Number(bom.yield_qty || 0).toFixed(2)} {bom.yield_unit || ""}</div>
                <div className="font-black text-slate-900">{formatMoney(bom.cost_per_unit)}</div>
                <div className="font-black text-[#A855F7]">{formatMoney(bom.suggested_selling_price)}</div>
                <div className="font-black text-violet-700">{bom.status || "Draft"}</div>
                <div className="flex gap-2">
                  <Link href={`/recipes/${bom.id}`} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Open</Link>
                  {canCreate ? (
                    <button type="button" onClick={() => void duplicate(bom)} className="rounded-xl bg-slate-100 p-2 text-slate-700"><Copy size={16} /></button>
                  ) : null}
                  {canDelete ? (
                    <button type="button" onClick={() => void remove(bom.id)} className="rounded-xl bg-red-50 p-2 text-red-700"><Trash2 size={16} /></button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </VyronPremiumPageShell>
  );
}
