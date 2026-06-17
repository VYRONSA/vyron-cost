"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Layers, Plus, RefreshCcw, Save, ShieldCheck, Sparkles, TrendingUp, X } from "lucide-react";
import { formatMoney } from "@/lib/vyron-cost-data";
import { useInventoryPermissions } from "@/hooks/useModulePermissions";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import { VyronModuleDataSection, VyronTableSurface, VYRON_TABLE } from "@/components/vyron-ui";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VyronPremiumSectionHeading } from "@/components/vyron-premium/VyronPremiumSprint";

const M = VYRON_MASTER;

type Item = {
  id: string;
  item_code: string;
  description: string;
  category: string;
  entity_type: string;
  stock_status: string;
  qty_on_hand: number;
  unit: string;
  average_cost: number;
  current_cost?: number;
  inventory_value: number;
  reorder_level?: number;
  min_level?: number;
  max_level?: number;
  valuation_method: string;
};

const emptyForm = {
  entityType: "ingredient",
  itemCode: "",
  description: "",
  category: "",
  unit: "kg",
  currentCost: "0",
  openingQty: "0",
  openingDate: new Date().toISOString().slice(0, 10),
  openingNote: "",
  reorderLevel: "10",
  minLevel: "5",
  maxLevel: "500",
};

export default function InventoryStockListClient({
  initialEntityType = "",
  initialStatus = "",
}: {
  initialEntityType?: string;
  initialStatus?: string;
}) {
  const { canPostAdjustment } = useInventoryPermissions();
  const [items, setItems] = useState<Item[]>([]);
  const [entityType, setEntityType] = useState(initialEntityType || "all");
  const [status, setStatus] = useState(initialStatus || "all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (entityType !== "all") params.set("entityType", entityType);
    if (status !== "all") params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    const { query: workspaceQuery } = poApiWorkspaceContext();
    const merged = new URLSearchParams(workspaceQuery ? workspaceQuery.slice(1) : "");
    params.forEach((value, key) => merged.set(key, value));
    const res = await fetch(`/api/inventory/stock?${merged}`, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setItems(data.items || []);
    else setMessage(data.error || "Could not load inventory items.");
    setLoading(false);
  }, [entityType, status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.qty += Number(item.qty_on_hand || 0);
        acc.value += Number(item.inventory_value || 0);
        if (item.entity_type === "finished_goods") acc.finishedValue += Number(item.inventory_value || 0);
        else acc.rawValue += Number(item.inventory_value || 0);
        return acc;
      },
      { qty: 0, value: 0, rawValue: 0, finishedValue: 0 }
    );
  }, [items]);

  function updateForm(key: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveItem() {
    if (!canPostAdjustment) {
      setMessage("You do not have permission to add inventory items.");
      return;
    }
    if (!form.description.trim()) {
      setMessage("Description is required.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { body: workspaceBody } = poApiWorkspaceContext();
    const res = await fetch("/api/inventory/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...workspaceBody,
        action: "create",
        entityType: form.entityType,
        itemCode: form.itemCode,
        description: form.description,
        category: form.category,
        unit: form.unit,
        currentCost: Number(form.currentCost || 0),
        openingQty: Number(form.openingQty || 0),
        openingDate: form.openingDate || undefined,
        openingNote: form.openingNote.trim() || undefined,
        reorderLevel: Number(form.reorderLevel || 0),
        minLevel: Number(form.minLevel || 0),
        maxLevel: Number(form.maxLevel || 0),
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!data.ok) {
      setMessage(data.error || "Could not save inventory item.");
      return;
    }

    setMessage("Inventory item saved.");
    setForm(emptyForm);
    setAddOpen(false);
    await load();
  }

  const stockActions = (
    <>
      {canPostAdjustment ? (
        <button
          type="button"
          onClick={() => setAddOpen((open) => !open)}
          className={`inline-flex items-center gap-2 rounded-xl ${M.primaryBtn} px-5 py-3 text-sm`}
        >
          {addOpen ? <X size={17} /> : <Plus size={17} />}
          {addOpen ? "Close Add Item" : "Add Inventory Item"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void load()}
        className={`inline-flex items-center gap-2 ${M.secondaryBtn} px-5 py-3 text-sm`}
      >
        <RefreshCcw size={17} />
        Refresh Stock
      </button>
    </>
  );

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "inventory",
        badge: "Premium Inventory Workspace",
        title: "Stock Master Control",
        subtitle: "Control raw materials, packaging and finished goods stock — with opening balances, reorder levels, valuation and risk visibility.",
        controlTitle: "Stock Master Control",
        formulaEyebrow: "Inventory value",
        formulaTitle: "How VYRON values stock",
        formulas: [
          { label: "Inventory Value", formula: "Qty on hand × weighted average cost" },
          { label: "Raw / Packaging", formula: "Ingredient + packaging stock value" },
          { label: "Finished Goods", formula: "Finished stock × production cost" },
        ],
        intelligenceEyebrow: "Stock signals",
        intelligenceTitle: "What to watch",
      }}
      actions={stockActions}
      showSpotlight={false}
    >
      <VyronPremiumSectionHeading
        eyebrow="Live stock position"
        title="Inventory exposure snapshot"
        subtitle="These values are calculated from the currently loaded stock records in this workspace."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Items" value={String(items.length)} />
        <Metric label="Total Qty" value={totals.qty.toFixed(2)} />
        <Metric label="Raw / Packaging Value" value={formatMoney(totals.rawValue)} />
        <Metric label="Finished Goods Value" value={formatMoney(totals.finishedValue)} />
      </div>

      <VyronModuleDataSection>
        {message ? (
          <div className="mb-4 rounded-2xl border border-[#7C3AED]/20 bg-[#7C3AED]/8 px-4 py-3 text-sm font-semibold text-[#0F172A]">
            {message}
          </div>
        ) : null}

        {addOpen ? (
          <div className="mb-6 rounded-[2rem] border border-violet-100 bg-violet-50/40 p-5">
            <div className="mb-4">
              <h3 className="text-xl font-black text-slate-950">Add New Inventory Item</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Use this for ingredients, packaging and finished goods. Opening quantity posts the starting stock balance.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label>
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Item Type</span>
                <select
                  value={form.entityType}
                  onChange={(e) => updateForm("entityType", e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold outline-none"
                >
                  <option value="ingredient">Raw Material / Ingredient</option>
                  <option value="packaging">Packaging</option>
                  <option value="finished_goods">Finished Good</option>
                </select>
              </label>
              <Input label="Item Code" value={form.itemCode} onChange={(v) => updateForm("itemCode", v)} placeholder="Auto if blank" />
              <Input label="Description" value={form.description} onChange={(v) => updateForm("description", v)} />
              <Input label="Category" value={form.category} onChange={(v) => updateForm("category", v)} placeholder="e.g. Meat, Packaging, Pies" />
              <Input label="Unit" value={form.unit} onChange={(v) => updateForm("unit", v)} placeholder="kg, unit, box" />
              <Input label="Current Cost" type="number" value={form.currentCost} onChange={(v) => updateForm("currentCost", v)} />
              <Input label="Opening Qty" type="number" value={form.openingQty} onChange={(v) => updateForm("openingQty", v)} />
              <Input label="Opening Date" type="date" value={form.openingDate} onChange={(v) => updateForm("openingDate", v)} />
              <Input label="Reference / Note" value={form.openingNote} onChange={(v) => updateForm("openingNote", v)} placeholder="Opening balance note" />
              <Input label="Reorder Level" type="number" value={form.reorderLevel} onChange={(v) => updateForm("reorderLevel", v)} />
              <Input label="Min Level" type="number" value={form.minLevel} onChange={(v) => updateForm("minLevel", v)} />
              <Input label="Max Level" type="number" value={form.maxLevel} onChange={(v) => updateForm("maxLevel", v)} />
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => void saveItem()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-[#F8FAFC] disabled:opacity-60"
              >
                <Save size={17} />
                {saving ? "Saving…" : "Save Inventory Item"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          <input
            className={`min-w-[220px] ${M.input}`}
            placeholder="Search stock…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={M.select} value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="all">All types</option>
            <option value="ingredient">Ingredients</option>
            <option value="packaging">Packaging</option>
            <option value="finished_goods">Finished Goods</option>
          </select>
          <select className={M.select} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="In Stock">In Stock</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Out Of Stock">Out Of Stock</option>
            <option value="Overstock">Overstock</option>
            <option value="Slow Moving">Slow Moving</option>
          </select>
        </div>

        <VyronTableSurface>
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className={VYRON_TABLE.head}>
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Avg Cost</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={VYRON_TABLE.rowHover}>
                  <td className="px-4 py-3 font-semibold text-[#0F172A]">{item.item_code}</td>
                  <td className="px-4 py-3 font-medium text-[#334155]">{item.description}</td>
                  <td className="px-4 py-3 text-[#334155]">{item.entity_type}</td>
                  <td className="px-4 py-3 font-semibold text-[#7C3AED]">{item.stock_status}</td>
                  <td className="px-4 py-3 text-right font-bold">
                    {Number(item.qty_on_hand).toFixed(2)} {item.unit}
                  </td>
                  <td className="px-4 py-3 text-right">R{Number(item.average_cost).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-black">{formatMoney(item.inventory_value)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/inventory/stock/${item.id}`} className="text-xs font-bold text-[#7C3AED]">
                      Detail →
                    </Link>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                    No inventory items found. Click Add Inventory Item to create opening stock.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td colSpan={8} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                    Loading inventory…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </VyronTableSurface>
      </VyronModuleDataSection>
    </VyronPremiumPageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-[0_16px_50px_rgba(76,29,149,0.08)]">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">{label}</p>
      <p className="mt-3 truncate text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label>
      <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold outline-none placeholder:text-slate-300 focus:border-violet-400"
      />
    </label>
  );
}
