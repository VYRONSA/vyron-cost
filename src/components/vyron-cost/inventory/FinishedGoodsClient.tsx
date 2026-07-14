"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/vyron-cost/stock-engine";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import ExportCentreDialog, { type ExportCentreState } from "@/components/vyron-platform/ExportCentreDialog";
import {
  VyronPremiumEmptyState,
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

type FinishedGoodItem = {
  id: string;
  productId: string;
  product_name: string;
  sku: string;
  code?: string;
  category?: string;
  unit_of_measure?: string;
  standard_cost?: number;
  current_stock: number;
  qty_on_hand: number;
  average_unit_cost: number;
  selling_price: number;
  stock_value: number;
  gross_profit?: number;
  gross_profit_percent?: number;
  activity_status?: "Active" | "Inactive";
  linked_bom_id?: string | null;
  recipe_bom_version?: string;
  created_at?: string | null;
  updated_at?: string | null;
  last_manufactured_at: string;
  sales_velocity_30_days: number;
  days_cover: number;
  status: "Healthy" | "Low Stock" | "Overstocked" | "Watch";
};

type SortBy =
  | "name"
  | "code"
  | "category"
  | "status"
  | "standard_cost"
  | "current_cost"
  | "selling_price"
  | "gross_profit"
  | "gross_profit_percent"
  | "updated_at";

type SortDirection = "asc" | "desc";
type ExportScope = "stock_only" | "all";
type ExportScopeWithSelected = "stock_only" | "all" | "selected";

const INCLUDE_OPTIONS = [
  { key: "includeActive", label: "Include Active Products" },
  { key: "includeInactive", label: "Include Inactive Products" },
  { key: "includeArchived", label: "Include Archived Products" },
  { key: "includeRecipes", label: "Include Recipes / BOM" },
  { key: "includeSuppliers", label: "Include Current Suppliers" },
  { key: "includeCostInfo", label: "Include Cost Information" },
  { key: "includeSellingPrices", label: "Include Selling Prices" },
  { key: "includePricingHistory", label: "Include Pricing History" },
  { key: "includeLastManufacturingDate", label: "Include Last Manufacturing Date" },
  { key: "includeLastProductionQty", label: "Include Last Production Quantity" },
  { key: "includeInventoryStats", label: "Include Inventory Statistics" },
] as const;

const INVENTORY_FIELD_OPTIONS = [
  { key: "stockOnHand", label: "Stock On Hand" },
  { key: "availableStock", label: "Available Stock" },
  { key: "allocatedStock", label: "Allocated Stock" },
  { key: "onOrder", label: "On Order" },
  { key: "reorderLevel", label: "Reorder Level" },
  { key: "inventoryValue", label: "Inventory Value" },
  { key: "averageCost", label: "Average Cost" },
  { key: "standardCost", label: "Standard Cost" },
  { key: "currentCost", label: "Current Cost" },
] as const;

const MANUFACTURING_FIELD_OPTIONS = [
  { key: "recipeVersion", label: "Recipe Version" },
  { key: "yield", label: "Yield" },
  { key: "batchSize", label: "Batch Size" },
  { key: "productionUnit", label: "Production Unit" },
  { key: "defaultWarehouse", label: "Default Warehouse" },
  { key: "manufacturingStatus", label: "Manufacturing Status" },
] as const;

const COMMERCIAL_FIELD_OPTIONS = [
  { key: "sellingPrice", label: "Selling Price" },
  { key: "grossProfit", label: "Gross Profit" },
  { key: "grossProfitPercent", label: "Gross Profit %" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "productGroup", label: "Product Group" },
] as const;

const SORT_OPTIONS = [
  { key: "code", label: "Product Code" },
  { key: "name", label: "Product Name" },
  { key: "category", label: "Category" },
  { key: "current_cost", label: "Cost" },
  { key: "selling_price", label: "Selling Price" },
  { key: "gross_profit", label: "Gross Profit" },
  { key: "created_at", label: "Created Date" },
  { key: "updated_at", label: "Updated Date" },
] as const;

function parseFileName(contentDisposition: string | null) {
  if (!contentDisposition) return null;
  const utf8 = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) return decodeURIComponent(utf8[1]);
  const fallback = contentDisposition.match(/filename="?([^\";]+)"?/i);
  if (fallback?.[1]) return fallback[1];
  return null;
}

export default function FinishedGoodsClient() {
  const [items, setItems] = useState<FinishedGoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState<"csv" | "xlsx" | null>(null);
  const [exportError, setExportError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [exportScope, setExportScope] = useState<ExportScope>("stock_only");
  const [includeZeroBalance, setIncludeZeroBalance] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [exportCentreOpen, setExportCentreOpen] = useState(false);
  const [exportConfig, setExportConfig] = useState<ExportCentreState>({
    format: "xlsx",
    scope: "stock_only",
    includeZeroBalance: true,
    includeFlags: {
      includeActive: true,
      includeInactive: false,
      includeArchived: false,
      includeRecipes: true,
      includeSuppliers: true,
      includeCostInfo: true,
      includeSellingPrices: true,
      includePricingHistory: false,
      includeLastManufacturingDate: false,
      includeLastProductionQty: false,
      includeInventoryStats: false,
    },
    inventoryFieldFlags: {
      stockOnHand: true,
      availableStock: true,
      allocatedStock: true,
      onOrder: true,
      reorderLevel: true,
      inventoryValue: true,
      averageCost: true,
      standardCost: true,
      currentCost: true,
    },
    manufacturingFieldFlags: {
      recipeVersion: true,
      yield: true,
      batchSize: true,
      productionUnit: true,
      defaultWarehouse: true,
      manufacturingStatus: true,
    },
    commercialFieldFlags: {
      sellingPrice: true,
      grossProfit: true,
      grossProfitPercent: true,
      category: true,
      brand: true,
      productGroup: true,
    },
    filters: {
      dateCreatedFrom: "",
      dateCreatedTo: "",
      dateUpdatedFrom: "",
      dateUpdatedTo: "",
      createdBy: "",
      supplier: "",
      category: "",
      status: "",
      productGroup: "",
      search: "",
    },
    sortBy: "name",
    sortDirection: "asc",
  });

  const refresh = useCallback(() => {
    setLoading(true);
    const context = poApiWorkspaceContext();
    const params = new URLSearchParams(context.query.replace(/^\?/, ""));
    params.set("search", search);
    params.set("category", categoryFilter);
    params.set("status", statusFilter);
    params.set("sortBy", sortBy);
    params.set("sortDirection", sortDirection);

    fetch(`/api/inventory/finished-goods?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.items)) {
          setItems(d.items as FinishedGoodItem[]);
        }
      })
      .finally(() => setLoading(false));
  }, [categoryFilter, search, sortBy, sortDirection, statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set(items.map((item) => String(item.category || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const totalValue = items.reduce((sum, item) => sum + item.stock_value, 0);
  const totalUnits = items.reduce((sum, item) => sum + item.current_stock, 0);
  const lowStock = items.filter((item) => item.status === "Low Stock").length;
  const fastest = [...items].sort((a, b) => b.sales_velocity_30_days - a.sales_velocity_30_days)[0];

  async function runExportFromCentre() {
    setExportError("");
    setExportBusy(exportConfig.format === "pdf" ? "xlsx" : exportConfig.format);
    try {
      const context = poApiWorkspaceContext();
      const params = new URLSearchParams(context.query.replace(/^\?/, ""));
      params.set("format", exportConfig.format);
      params.set("search", exportConfig.filters.search || search);
      params.set("category", exportConfig.filters.category || categoryFilter);
      params.set("status", exportConfig.filters.status || statusFilter);
      params.set("sortBy", exportConfig.sortBy || sortBy);
      params.set("sortDirection", exportConfig.sortDirection || sortDirection);
      params.set("scope", exportConfig.scope as ExportScopeWithSelected);
      params.set("includeZeroBalance", String(exportConfig.includeZeroBalance));
      params.set("dateCreatedFrom", exportConfig.filters.dateCreatedFrom);
      params.set("dateCreatedTo", exportConfig.filters.dateCreatedTo);
      params.set("dateUpdatedFrom", exportConfig.filters.dateUpdatedFrom);
      params.set("dateUpdatedTo", exportConfig.filters.dateUpdatedTo);
      params.set("createdBy", exportConfig.filters.createdBy);
      params.set("supplier", exportConfig.filters.supplier);
      params.set("productGroup", exportConfig.filters.productGroup);
      params.set("selectedIds", Object.keys(selectedIds).filter((id) => selectedIds[id]).join(","));
      params.set("includeFlags", JSON.stringify(exportConfig.includeFlags));
      params.set("inventoryFieldFlags", JSON.stringify(exportConfig.inventoryFieldFlags));
      params.set("manufacturingFieldFlags", JSON.stringify(exportConfig.manufacturingFieldFlags));
      params.set("commercialFieldFlags", JSON.stringify(exportConfig.commercialFieldFlags));

      const response = await fetch(`/api/inventory/finished-goods/export?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload?.error || "Finished goods export failed."));
      }

      const blob = await response.blob();
      const fileName = parseFileName(response.headers.get("Content-Disposition")) || `FinishedGoods.${exportConfig.format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportCentreOpen(false);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Finished goods export failed.");
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <div className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="inventory"
        badge="Premium Inventory Workspace"
        title="Finished Goods Intelligence"
        subtitle="On-hand finished goods value, velocity and low-stock risk from the inventory intelligence layer."
        outcomes={[
          "Monitor total finished goods value",
          "See units on hand and low-stock count",
          "Identify fastest-moving products",
          "Drill into stock detail per SKU",
        ]}
        quotes={[
          { label: "Inventory", quote: "Inventory is cash wearing a disguise." },
          { label: "Velocity", quote: "What gets measured gets protected." },
        ]}
      />

      <VyronPremiumFormulaCard
        variant="light"
        eyebrow="Valuation"
        title="Finished goods formulas"
        formulas={[
          { label: "Stock Value", formula: "On-hand qty × weighted average unit cost" },
          { label: "Velocity", formula: "Units sold (30 days) ÷ average on-hand qty" },
          { label: "Low Stock", formula: "On-hand qty below reorder threshold" },
        ]}
        className="max-w-2xl"
      />

      <VyronPremiumSectionHeading eyebrow="Live metrics" title="Finished goods snapshot" />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Finished Goods Value" value={loading ? "…" : formatCurrency(totalValue)} />
        <MetricCard title="Units In Stock" value={loading ? "…" : formatNumber(totalUnits)} />
        <MetricCard title="Low Stock Products" value={loading ? "…" : String(lowStock)} />
        <MetricCard title="Fastest Mover" value={fastest?.product_name ?? "—"} />
      </div>

      <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.10)]">
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-black text-slate-950">Finished Goods Intelligence</h2>
            <p className="text-sm font-medium text-slate-600">Manufactured stock ready for customer sale, with cost, value and days-cover intelligence.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setExportCentreOpen(true)}
              disabled={exportBusy !== null}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={14} /> Export
            </button>
            <Link href="/manufacturing-intelligence" className="rounded-full bg-purple-700 px-5 py-2 text-sm font-black text-white shadow-lg shadow-purple-700/20">Open Manufacturing</Link>
          </div>
        </div>

        <div className="mb-5 grid gap-3 lg:grid-cols-5">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search finished goods..."
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none"
          />
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none"
          >
            <option value="">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "" | "active" | "inactive")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortBy)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none"
          >
            <option value="name">Sort: Name</option>
            <option value="code">Sort: Code</option>
            <option value="category">Sort: Category</option>
            <option value="status">Sort: Status</option>
            <option value="standard_cost">Sort: Standard Cost</option>
            <option value="current_cost">Sort: Current Cost</option>
            <option value="selling_price">Sort: Selling Price</option>
            <option value="gross_profit">Sort: Gross Profit</option>
            <option value="gross_profit_percent">Sort: Gross Profit %</option>
            <option value="updated_at">Sort: Last Updated</option>
          </select>
          <select
            value={sortDirection}
            onChange={(event) => setSortDirection(event.target.value as SortDirection)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>

        {exportError ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{exportError}</div> : null}

        {!loading && items.length === 0 ? (
          <VyronPremiumEmptyState
            steps={[
              "Create products and link them to BOMs.",
              "Run and complete a manufacturing batch.",
              "Post finished goods output to inventory.",
              "Return here to monitor value and velocity.",
            ]}
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
              <label className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean(selectedIds[item.id])}
                  onChange={(event) =>
                    setSelectedIds((prev) => ({
                      ...prev,
                      [item.id]: event.target.checked,
                    }))
                  }
                />
                Select for export
              </label>
              <Link href={`/products/${item.id}/edit`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-black text-slate-950">{item.product_name}</p>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{item.sku}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${badgeClass(item.status)}`}>{item.status}</span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <SmallMetric label="Stock" value={formatNumber(item.current_stock)} />
                <SmallMetric label="Cost" value={formatCurrency(item.average_unit_cost)} />
                <SmallMetric label="Value" value={formatCurrency(item.stock_value)} />
                <SmallMetric label="Days Cover" value={`${item.days_cover} days`} />
              </div>

              <div className="mt-5 rounded-2xl bg-purple-50 p-4 text-sm font-semibold text-purple-900">
                AI: {recommendation(item.status, item.product_name)}
              </div>
              </Link>
            </div>
          ))}
        </div>

        <ExportCentreDialog
          open={exportCentreOpen}
          title="Finished Goods Export Centre"
          selectedCount={Object.keys(selectedIds).filter((id) => selectedIds[id]).length}
          busy={exportBusy !== null}
          error={exportError}
          state={exportConfig}
          onClose={() => setExportCentreOpen(false)}
          onStateChange={setExportConfig}
          onExport={() => void runExportFromCentre()}
          includeOptions={[...INCLUDE_OPTIONS]}
          inventoryFieldOptions={[...INVENTORY_FIELD_OPTIONS]}
          manufacturingFieldOptions={[...MANUFACTURING_FIELD_OPTIONS]}
          commercialFieldOptions={[...COMMERCIAL_FIELD_OPTIONS]}
          sortOptions={[...SORT_OPTIONS]}
        />
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return <div className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_16px_50px_rgba(76,29,149,0.10)]"><p className="text-xs font-black uppercase tracking-[0.18em] text-purple-700">{title}</p><p className="mt-3 text-2xl font-black text-slate-950">{value}</p></div>;
}
function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 text-sm font-black text-slate-950">{value}</p></div>;
}
function badgeClass(status: string) {
  if (status === "Low Stock") return "bg-rose-100 text-rose-800";
  if (status === "Overstocked") return "bg-amber-100 text-amber-800";
  if (status === "Watch") return "bg-indigo-100 text-indigo-800";
  return "bg-[#A3E635]/12 text-[#4D7C0F]";
}
function recommendation(status: string, product: string) {
  if (status === "Low Stock") return `${product} is below safe cover. Recommend manufacturing within 48 hours.`;
  if (status === "Overstocked") return `${product} has high cover. Slow production or promote to customers.`;
  if (status === "Watch") return `${product} is moving fast. Monitor customer invoices before next production run.`;
  return `${product} stock is healthy. Maintain current production rhythm.`;
}
