"use client";

import { Copy, FileText, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { BomHeader, demoBoms, formatMoney } from "@/lib/vyron-cost-bom-data";
import { recipeToBomHeader } from "@/lib/vyron-cost-recipes-data";
import {
  BOM_PURPOSES,
  BOM_PURPOSE_LABELS,
  normaliseBomPurpose,
  type BomPurpose,
} from "@/lib/vyron-cost-sub-boms";
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
    bom_purpose: normaliseBomPurpose(row.bom_purpose),
    image_bucket: row.image_bucket ? String(row.image_bucket) : null,
    image_path: row.image_path ? String(row.image_path) : null,
    image_mime: row.image_mime ? String(row.image_mime) : null,
  });
}

export default function BomListClient({
  boms: initialBoms,
  demoSeed = false,
}: {
  boms: BomHeader[];
  demoSeed?: boolean;
}) {
  const router = useRouter();
  const { canCreate, canDelete } = useModulePermissions("boms");
  const [items, setItems] = useState(demoSeed ? initialBoms : []);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [descriptionFilter, setDescriptionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [categories, setCategories] = useState<string[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecipes = useCallback(
    async (showRefresh = false) => {
      const client = readActiveClient();
      const demo = isDemoWorkspace(client);
      setDemoMode(demo);

      if (demo) {
        setItems(demoBoms);
        setCategories(
          [...new Set(demoBoms.map((bom) => (bom.category || "").trim()).filter(Boolean))].sort((a, b) =>
            a.localeCompare(b)
          )
        );
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("name", search.trim());
        if (categoryFilter !== "All") params.set("category", categoryFilter);
        if (descriptionFilter.trim()) params.set("description", descriptionFilter.trim());
        const query = params.toString();
        const response = await fetch(`/api/recipes${query ? `?${query}` : ""}`);
        const data = await response.json();
        if (data.ok && Array.isArray(data.recipes)) {
          setItems(data.recipes.map((row: Record<string, unknown>) => mapRecipeRow(row)));
          if (Array.isArray(data.categories)) setCategories(data.categories as string[]);
        } else {
          setItems([]);
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [search, categoryFilter, descriptionFilter]
  );

  /**
   * Typing runs through the database, so the request is debounced — one query
   * per pause rather than one per keystroke. Kept as a single effect so the
   * filters drive the same load path the screen already used.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRecipes();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadRecipes]);

  /** The BOM being copied, and the copy dialog's fields. */
  const [copySource, setCopySource] = useState<BomHeader | null>(null);
  const [copyName, setCopyName] = useState("");
  const [copyPurpose, setCopyPurpose] = useState<BomPurpose>("Finished Good");
  const [copyImage, setCopyImage] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState("");

  /**
   * Thumbnails need a signed URL each, so only recipes that actually have a
   * photo are asked for one. Recipes without an image cost nothing and render
   * exactly as they did before.
   */
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    // Rows reach this list two ways: straight from the recipes table, which
    // carries image_path, and through recipeToBomHeader, which reduces the path
    // to the has_image boolean and drops it. Either one means there is a
    // picture to fetch; testing only one of them fetched nothing.
    const withImage = items.filter((bom) => bom.has_image || bom.image_path).map((bom) => bom.id);
    if (!withImage.length) return;
    let cancelled = false;
    void Promise.all(
      withImage.map(async (id) => {
        const data = await fetch(`/api/recipes/${id}/image`).then((r) => r.json()).catch(() => null);
        return [id, data?.ok && data.image?.url ? (data.image.url as string) : ""] as const;
      })
    ).then((pairs) => {
      if (cancelled) return;
      setThumbs(Object.fromEntries(pairs.filter(([, url]) => url)));
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  function openCopy(bom: BomHeader) {
    setCopySource(bom);
    setCopyName(`${bom.bom_name} (Copy)`);
    setCopyPurpose(normaliseBomPurpose(bom.bom_purpose));
    // Off by default: a copy is a new pack until somebody says otherwise.
    setCopyImage(false);
    setCopyError("");
  }

  /**
   * Copy & edit opens the builder on a draft. Deliberately no request: the copy
   * exists only in the form until the user saves, so backing out leaves nothing
   * behind. Copy now, below, is unchanged and still writes immediately.
   */
  function copyAndEdit() {
    if (!copySource) return;
    const params = new URLSearchParams({ copyFrom: copySource.id });
    // Whatever the operator typed here is what they meant to call it.
    const typed = copyName.trim();
    if (typed) params.set("name", typed);
    if (copyImage) params.set("copyImage", "1");
    setCopySource(null);
    router.push(`/recipes/new?${params.toString()}`);
  }

  async function submitCopy() {
    if (!copySource) return;
    const name = copyName.trim();
    if (!name) {
      setCopyError("Give the new BOM a name.");
      return;
    }
    setCopyBusy(true);
    setCopyError("");
    try {
      // The demo workspace has no database behind it, so a copy there stays in
      // memory. duplicate() is that path and is kept for it alone; a real
      // workspace goes through the copy endpoint, which also brings components,
      // child BOM references and the pack image across.
      if (demoMode) {
        await duplicate(copySource);
        setCopySource(null);
        return;
      }

      const res = await fetch(`/api/recipes/${copySource.id}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: name, purpose: copyPurpose, copyImage }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Copy failed.");
      setCopySource(null);
      await loadRecipes(true);
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : "Copy failed.");
    } finally {
      setCopyBusy(false);
    }
  }

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (search.trim()) chips.push({ key: "name", label: `Name: ${search.trim()}`, clear: () => setSearch("") });
    if (categoryFilter !== "All")
      chips.push({ key: "category", label: `Category: ${categoryFilter}`, clear: () => setCategoryFilter("All") });
    if (descriptionFilter.trim())
      chips.push({
        key: "description",
        label: `Description: ${descriptionFilter.trim()}`,
        clear: () => setDescriptionFilter(""),
      });
    if (statusFilter !== "All")
      chips.push({ key: "status", label: `Status: ${statusFilter}`, clear: () => setStatusFilter("All") });
    return chips;
  }, [search, categoryFilter, descriptionFilter, statusFilter]);

  function clearFilters() {
    setSearch("");
    setCategoryFilter("All");
    setDescriptionFilter("");
    setStatusFilter("All");
  }

  /**
   * Name, category and description are already applied by the database. Demo
   * mode has no server to query, so it repeats them here; status stays a
   * client-side refinement, as it was before.
   */
  const filtered = useMemo(() => {
    let list = items;
    if (statusFilter !== "All") {
      list = list.filter((bom) => (bom.status || "Draft") === statusFilter);
    }
    if (!demoMode) return list;

    const term = search.trim().toLowerCase();
    if (term) list = list.filter((bom) => bom.bom_name.toLowerCase().includes(term));
    if (categoryFilter !== "All") list = list.filter((bom) => (bom.category || "") === categoryFilter);
    const note = descriptionFilter.trim().toLowerCase();
    if (note) list = list.filter((bom) => (bom.notes || "").toLowerCase().includes(note));
    return list;
  }, [items, search, categoryFilter, descriptionFilter, statusFilter, demoMode]);

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
            <div className="flex w-full items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 md:w-auto">
              <Search size={18} className="shrink-0 text-violet-700" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search BOMs..." className="w-full min-w-0 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400 md:w-72" />
            </div>
            <div className="flex w-full items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 md:w-auto">
              <FileText size={18} className="shrink-0 text-violet-700" />
              <input
                value={descriptionFilter}
                onChange={(e) => setDescriptionFilter(e.target.value)}
                placeholder="Search description..."
                aria-label="Search recipe description"
                className="w-full min-w-0 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400 md:w-56"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
              className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-black text-violet-800 outline-none md:w-auto"
            >
              <option value="All">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-black text-violet-800 outline-none md:w-auto"
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

        {activeFilters.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Active filters</span>
            {activeFilters.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                aria-label={`Remove filter ${chip.label}`}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-800"
              >
                <span className="truncate">{chip.label}</span>
                <X size={14} className="shrink-0" />
              </button>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600"
            >
              Clear all
            </button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-[2rem] bg-white p-10 text-center text-sm font-bold text-slate-500 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          Loading recipes...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[2rem] bg-white p-10 text-center shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h3 className="text-xl font-black text-slate-900">
            {activeFilters.length ? "No matching BOMs" : "No BOMs yet"}
          </h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {activeFilters.length
              ? "No recipes match every active filter. Try relaxing one, or clear them to see the full library."
              : "Create your first recipe / BOM to cost ingredients, packaging, labour and yield."}
          </p>
          {activeFilters.length ? (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-700"
            >
              Clear all filters
            </button>
          ) : null}
          {!activeFilters.length && canCreate ? (
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
              <div>BOM</div><div>Purpose</div><div>Yield</div><div>Cost / Unit</div><div>Suggested</div><div>Status</div><div>Actions</div>
            </div>

            {filtered.map((bom) => (
              <div key={bom.id} className="grid grid-cols-[260px_170px_120px_130px_130px_100px_190px] items-center border-t border-slate-100 px-5 py-4 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  {thumbs[bom.id] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={thumbs[bom.id]}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-xl border border-slate-100 object-cover"
                    />
                  ) : null}
                  <Link href={`/recipes/${bom.id}`} className="truncate font-black text-violet-700">{bom.bom_name}</Link>
                </div>
                <div className="font-bold text-slate-500">
                  {BOM_PURPOSE_LABELS[normaliseBomPurpose(bom.bom_purpose)]}
                </div>
                <div className="font-bold text-slate-500">{Number(bom.yield_qty || 0).toFixed(2)} {bom.yield_unit || ""}</div>
                <div className="font-black text-slate-900">{formatMoney(bom.cost_per_unit)}</div>
                <div className="font-black text-[#A855F7]">{formatMoney(bom.suggested_selling_price)}</div>
                <div className="font-black text-violet-700">{bom.status || "Draft"}</div>
                <div className="flex gap-2">
                  <Link href={`/recipes/${bom.id}`} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Open</Link>
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={() => openCopy(bom)}
                      aria-label={`Copy ${bom.bom_name}`}
                      title="Copy BOM"
                      className="rounded-xl bg-slate-100 p-2 text-slate-700"
                    >
                      <Copy size={16} />
                    </button>
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

      {copySource ? (
        <div
          role="dialog"
          aria-label="Copy BOM"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          onClick={() => (copyBusy ? null : setCopySource(null))}
        >
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-950">Copy BOM</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Source: <span className="font-black text-slate-700">{copySource.bom_name}</span>
            </p>

            <label className="mt-5 block">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">New BOM Name</span>
              <input
                autoFocus
                value={copyName}
                onChange={(e) => setCopyName(e.target.value)}
                className="mt-2 min-h-[44px] w-full rounded-xl border border-violet-100 px-4 py-3 text-sm font-semibold outline-none focus:border-violet-400"
              />
            </label>

            <div className="mt-4">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">BOM Purpose</span>
              <div className="mt-2 space-y-2">
                {BOM_PURPOSES.map((purpose) => (
                  <label
                    key={purpose}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 ${
                      copyPurpose === purpose ? "border-violet-400 bg-violet-50" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="copy-purpose"
                      className="h-4 w-4"
                      checked={copyPurpose === purpose}
                      onChange={() => setCopyPurpose(purpose)}
                    />
                    <span className="text-sm font-black text-slate-900">{BOM_PURPOSE_LABELS[purpose]}</span>
                  </label>
                ))}
              </div>
              {copyPurpose === "Finished Good" ? (
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  The copy starts with no finished product linked. Open it after copying to choose or create one.
                </p>
              ) : null}
            </div>

            <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={copyImage} onChange={(e) => setCopyImage(e.target.checked)} />
              <span className="text-sm font-black text-slate-700">Copy pack image</span>
            </label>

            {copyError ? <p className="mt-3 text-xs font-bold text-red-600">{copyError}</p> : null}

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                disabled={copyBusy}
                onClick={copyAndEdit}
                className="min-h-[44px] w-full rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                Copy &amp; edit
              </button>
              <p className="px-1 text-xs font-semibold text-slate-500">
                Opens a copy in the editor. Nothing is saved until you save it.
              </p>

              <button
                type="button"
                disabled={copyBusy}
                onClick={() => void submitCopy()}
                className="mt-2 min-h-[44px] w-full rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-700 disabled:opacity-60"
              >
                {copyBusy ? "Copying…" : "Copy now"}
              </button>
              <p className="px-1 text-xs font-semibold text-slate-500">
                Creates the copy straight away, unchanged.
              </p>

              <button
                type="button"
                disabled={copyBusy}
                onClick={() => setCopySource(null)}
                className="mt-2 min-h-[44px] w-full rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-black text-slate-700 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </VyronPremiumPageShell>
  );
}
