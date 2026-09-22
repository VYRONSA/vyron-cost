"use client";

import Link from "next/link";
import {
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  Package,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  TriangleAlert,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import {
  VyronFooterStrip,
  VyronInsightCard,
  VyronMetricCard,
  VyronMetricGrid,
  VyronPageFrame,
  VyronQuoteCard,
  VyronSectionHeader,
  VyronSurfaceCard,
} from "@/components/vyron-ui";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";
import { VYRON_DOMAIN_QUOTES } from "@/components/vyron-premium/VyronPremiumTheme";
import type { ActiveClient } from "@/lib/vyron-developer-client";
import type { WorkspaceDashboardStats } from "@/lib/vyron-workspace-stats";
import type { StoreOrderOperationsStats } from "@/lib/vyron-store-orders";
import type { ProductionPlanningStats } from "@/lib/vyron-store-production-planning";
import type { InventoryTransactionDashboardStats } from "@/lib/vyron-inventory-transactions";
import type { ProcurementDashboardStats } from "@/lib/vyron-procurement-requisitions";
import type { PurchaseOrderEngineDashboardStats } from "@/lib/vyron-purchase-order-engine";
import type { DemandForecastDashboardStats } from "@/lib/vyron-demand-forecasting";
import type { CostAiInsightDashboardStats } from "@/lib/vyron-cost-ai-insights";
import PackageGatedSection from "@/components/admin/PackageGatedSection";

function formatCurrency(value: number) {
  return value.toLocaleString("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  });
}

type DemoWidgets = {
  increasesThisMonth: number;
  decreasesThisMonth: number;
  highestIncrease: { supplierName: string; percentageChange: number } | null;
  suppliersWithMostChanges: unknown[];
};

type DemoRecovery = { title: string; monthlyRecovery: number } | undefined;

const M = VYRON_MASTER;

const HERO_LINKS = [
  { label: "Costing", href: "/product-profitability", icon: TrendingUp },
  { label: "Inventory", href: "/inventory", icon: Warehouse },
  { label: "Production", href: "/production-planning", icon: Factory },
  { label: "Orders", href: "/order-inbox", icon: ShoppingCart },
];

function DashboardHero({ tradingName }: { tradingName: string }) {
  return (
    <section className={`${M.dashboardHero} volora-texture`}>
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(244,196,78,0.20),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(62,155,82,0.16),transparent_65%)]" />

      <div className="relative flex flex-col gap-6 p-6 md:p-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#F4C44E]">{tradingName}</div>
          <h1 className={`mt-3 break-words text-3xl leading-[1.1] tracking-[-0.02em] text-balance md:text-[2.5rem] ${M.headingOnDark}`}>
            Business Overview
          </h1>
          <span className="volora-rule mt-4" />
          <p className={`mt-4 max-w-lg text-sm font-medium leading-6 ${M.bodyOnDark}`}>
            Real-time cost, margin and operational intelligence.
          </p>
        </div>

        <nav aria-label="Quick links" className="flex min-w-0 flex-wrap gap-2 lg:max-w-[30rem] lg:justify-end">
          {HERO_LINKS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="volora-glass-dark flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#DDE7EB] transition hover:border-[#F4C44E]/40 hover:text-white"
            >
              <Icon size={15} className="shrink-0 text-[#F4C44E]" aria-hidden />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}

export default function DashboardPremiumClient({
  mode,
  tradingName,
  client,
  stats,
  storeOrderStats,
  productionPlanningStats,
  inventoryStats,
  procurementStats,
  purchaseOrderStats,
  demandForecastStats,
  costAiInsightStats,
  widgets,
  risks,
  topRecovery,
}: {
  mode: "demo" | "onboarding";
  tradingName: string;
  client?: ActiveClient | null;
  stats?: WorkspaceDashboardStats;
  storeOrderStats?: StoreOrderOperationsStats;
  productionPlanningStats?: ProductionPlanningStats;
  inventoryStats?: InventoryTransactionDashboardStats;
  procurementStats?: ProcurementDashboardStats;
  purchaseOrderStats?: PurchaseOrderEngineDashboardStats;
  demandForecastStats?: DemandForecastDashboardStats;
  costAiInsightStats?: CostAiInsightDashboardStats;
  widgets?: DemoWidgets;
  risks?: unknown[];
  topRecovery?: DemoRecovery;
}) {
  const packageName = client?.packageName || "Professional";
  const quotes = VYRON_DOMAIN_QUOTES.executive;
  const counts = stats || {
    suppliers: 0,
    ingredients: 0,
    products: 0,
    inventoryValue: 0,
    customerInvoices: 0,
    xeroStatus: "Not Connected",
  };
  const orderOps = storeOrderStats || {
    ordersToday: 0,
    revenueToday: 0,
    awaitingApproval: 0,
    picking: 0,
    readyForDispatch: 0,
    delivered: 0,
  };
  const productionOps = productionPlanningStats || {
    productionRequiredToday: 0,
    productionRunsOpen: 0,
    rawMaterialShortages: 0,
  };
  const inventoryOps = inventoryStats || {
    inventoryValue: 0,
    stockMovementsToday: 0,
    negativeStockWarnings: 0,
    stockAdjustments: 0,
  };
  const procurementOps = procurementStats || {
    openRequisitions: 0,
    procurementValue: 0,
    shortageValue: 0,
    ingredientsAtRisk: 0,
  };
  const purchaseOrderOps = purchaseOrderStats || {
    openPurchaseOrders: 0,
    outstandingReceipts: 0,
    purchaseValueThisMonth: 0,
    lateDeliveries: 0,
  };
  const demandForecastOps = demandForecastStats || {
    forecastRevenue: 0,
    forecastProduction: 0,
    forecastProcurementValue: 0,
    productsGrowingFastest: 0,
    warnings: [],
  };
  const costAiOps = costAiInsightStats || {
    criticalInsights: 0,
    highInsights: 0,
    totalInsights: 0,
    topRiskTitle: null,
    topOpportunityTitle: null,
  };

  return (
    <VyronPageFrame>
      <DashboardHero tradingName={tradingName} />

      <section>
        <VyronSectionHeader title="Executive KPI Overview" />
        <VyronMetricGrid>
          <VyronMetricCard label="Inventory Value" value={counts.inventoryValue > 0 ? formatCurrency(counts.inventoryValue) : "No data yet"} note="Awaiting transactions" href="/inventory" tone={counts.inventoryValue > 0 ? "healthy" : "default"} icon={<Warehouse size={18} />} />
          <VyronMetricCard label="Potential Recovery" value={topRecovery ? `R${topRecovery.monthlyRecovery.toLocaleString("en-ZA")}` : "No Recovery Yet"} note="Scanning pipeline" href="/financial-leakage" tone="warning" icon={<ShieldCheck size={18} />} />
          <VyronMetricCard label="Average GP" value="Not available" note="Open product profitability" href="/product-profitability" tone="default" icon={<TrendingUp size={18} />} />
          <VyronMetricCard label="Supplier Risk" value={(risks?.length ?? 0) > 0 ? `${risks?.length ?? 0} Alerts` : "No Risk"} note="Monitoring" href="/supplier-intelligence" tone={(risks?.length ?? 0) > 0 ? "danger" : "healthy"} icon={<TriangleAlert size={18} />} />
          <VyronMetricCard label="Active Products" value={counts.products > 0 ? String(counts.products) : "No data yet"} note="Monitoring" href="/products" tone={counts.products > 0 ? "healthy" : "default"} icon={<Package size={18} />} />
          <VyronMetricCard label="Revenue" value={counts.customerInvoices > 0 ? String(counts.customerInvoices) : "No data yet"} note="Invoice feed" href="/customer-invoices" tone={counts.customerInvoices > 0 ? "healthy" : "default"} icon={<BarChart3 size={18} />} />
        </VyronMetricGrid>
      </section>

      {mode === "onboarding" ? (
        <PackageGatedSection packageName={packageName} feature="store_ordering" title="Store Ordering Operations" stripe>
          <VyronSectionHeader title="Store Ordering Operations" />
          <VyronMetricGrid>
            <VyronMetricCard
              label="Orders Today"
              value={String(orderOps.ordersToday)}
              note="Orders dated today"
              href="/store-orders/dashboard"
              tone={orderOps.ordersToday > 0 ? "healthy" : "default"}
              icon={<ShoppingCart size={18} />}
            />
            <VyronMetricCard
              label="Revenue Today"
              value={formatCurrency(orderOps.revenueToday)}
              note="Net order value today"
              href="/store-orders/dashboard"
              tone={orderOps.revenueToday > 0 ? "healthy" : "default"}
              icon={<BarChart3 size={18} />}
            />
            <VyronMetricCard
              label="Pending Approval"
              value={String(orderOps.awaitingApproval)}
              note="Submitted queue"
              href="/store-orders/approvals"
              tone={orderOps.awaitingApproval > 0 ? "warning" : "default"}
              icon={<ClipboardCheck size={18} />}
            />
            <VyronMetricCard
              label="Picking"
              value={String(orderOps.picking)}
              note="Approved + in pick"
              href="/store-orders/picking"
              tone={orderOps.picking > 0 ? "healthy" : "default"}
              icon={<PackageCheck size={18} />}
            />
            <VyronMetricCard
              label="Ready for Dispatch"
              value={String(orderOps.readyForDispatch)}
              note="Pick complete"
              href="/store-orders/dispatch"
              tone={orderOps.readyForDispatch > 0 ? "healthy" : "default"}
              icon={<Truck size={18} />}
            />
            <VyronMetricCard
              label="Delivered"
              value={String(orderOps.delivered)}
              note="Completed deliveries"
              href="/store-orders/dispatch"
              tone={orderOps.delivered > 0 ? "healthy" : "default"}
              icon={<CheckCircle2 size={18} />}
            />
          </VyronMetricGrid>
        </PackageGatedSection>
      ) : null}

      {mode === "onboarding" ? (
        <PackageGatedSection packageName={packageName} feature="inventory" title="Inventory Intelligence">
          <VyronSectionHeader title="Inventory Intelligence" />
          <VyronMetricGrid>
            <VyronMetricCard
              label="Inventory Value"
              value={inventoryOps.inventoryValue > 0 ? formatCurrency(inventoryOps.inventoryValue) : "Monitoring"}
              note="Total stock value"
              href="/inventory-ledger"
              tone={inventoryOps.inventoryValue > 0 ? "healthy" : "default"}
              icon={<Warehouse size={18} />}
            />
            <VyronMetricCard
              label="Stock Movements Today"
              value={String(inventoryOps.stockMovementsToday)}
              note="Transactions posted today"
              href="/stock-movements"
              tone={inventoryOps.stockMovementsToday > 0 ? "healthy" : "default"}
              icon={<Package size={18} />}
            />
            <VyronMetricCard
              label="Negative Stock Warnings"
              value={String(inventoryOps.negativeStockWarnings)}
              note="Items below zero"
              href="/inventory/stock"
              tone={inventoryOps.negativeStockWarnings > 0 ? "danger" : "healthy"}
              icon={<TriangleAlert size={18} />}
            />
            <VyronMetricCard
              label="Stock Adjustments"
              value={String(inventoryOps.stockAdjustments)}
              note="Adjustments today"
              href="/stock-movements"
              tone={inventoryOps.stockAdjustments > 0 ? "warning" : "default"}
              icon={<ClipboardCheck size={18} />}
            />
          </VyronMetricGrid>
        </PackageGatedSection>
      ) : null}

      {mode === "onboarding" ? (
        <PackageGatedSection packageName={packageName} feature="procurement" title="Procurement Intelligence" stripe>
          <VyronSectionHeader title="Procurement Intelligence" />
          <VyronMetricGrid>
            <VyronMetricCard
              label="Open Requisitions"
              value={String(procurementOps.openRequisitions)}
              note="Draft through ordered"
              href="/procurement"
              tone={procurementOps.openRequisitions > 0 ? "healthy" : "default"}
              icon={<ShoppingCart size={18} />}
            />
            <VyronMetricCard
              label="Procurement Value"
              value={procurementOps.procurementValue > 0 ? formatCurrency(procurementOps.procurementValue) : "Monitoring"}
              note="Open requisition value"
              href="/procurement"
              tone={procurementOps.procurementValue > 0 ? "healthy" : "default"}
              icon={<BarChart3 size={18} />}
            />
            <VyronMetricCard
              label="Shortage Value"
              value={procurementOps.shortageValue > 0 ? formatCurrency(procurementOps.shortageValue) : "Monitoring"}
              note="Current shortage exposure"
              href="/procurement"
              tone={procurementOps.shortageValue > 0 ? "warning" : "default"}
              icon={<TriangleAlert size={18} />}
            />
            <VyronMetricCard
              label="Ingredients At Risk"
              value={String(procurementOps.ingredientsAtRisk)}
              note="Planning + inventory risk"
              href="/procurement"
              tone={procurementOps.ingredientsAtRisk > 0 ? "warning" : "healthy"}
              icon={<Package size={18} />}
            />
          </VyronMetricGrid>
        </PackageGatedSection>
      ) : null}

      {mode === "onboarding" ? (
        <PackageGatedSection packageName={packageName} feature="purchase_orders" title="Purchase Order Operations">
          <VyronSectionHeader title="Purchase Order Operations" />
          <VyronMetricGrid>
            <VyronMetricCard
              label="Open Purchase Orders"
              value={String(purchaseOrderOps.openPurchaseOrders)}
              note="Draft through partial receipt"
              href="/purchase-orders"
              tone={purchaseOrderOps.openPurchaseOrders > 0 ? "healthy" : "default"}
              icon={<ShoppingCart size={18} />}
            />
            <VyronMetricCard
              label="Outstanding Receipts"
              value={String(purchaseOrderOps.outstandingReceipts)}
              note="Lines awaiting receipt"
              href="/purchase-orders"
              tone={purchaseOrderOps.outstandingReceipts > 0 ? "warning" : "default"}
              icon={<PackageCheck size={18} />}
            />
            <VyronMetricCard
              label="Purchase Value This Month"
              value={purchaseOrderOps.purchaseValueThisMonth > 0 ? formatCurrency(purchaseOrderOps.purchaseValueThisMonth) : "Monitoring"}
              note="PO value created this month"
              href="/purchase-orders"
              tone={purchaseOrderOps.purchaseValueThisMonth > 0 ? "healthy" : "default"}
              icon={<BarChart3 size={18} />}
            />
            <VyronMetricCard
              label="Late Deliveries"
              value={String(purchaseOrderOps.lateDeliveries)}
              note="Past expected date"
              href="/purchase-orders"
              tone={purchaseOrderOps.lateDeliveries > 0 ? "danger" : "healthy"}
              icon={<TriangleAlert size={18} />}
            />
          </VyronMetricGrid>
        </PackageGatedSection>
      ) : null}

      {mode === "onboarding" ? (
        <PackageGatedSection packageName={packageName} feature="forecasting" title="Demand Forecasting" stripe>
          <VyronSectionHeader title="Demand Forecasting" />
          <VyronMetricGrid>
            <VyronMetricCard
              label="Forecast Revenue"
              value={demandForecastOps.forecastRevenue > 0 ? formatCurrency(demandForecastOps.forecastRevenue) : "Monitoring"}
              note="Next month from product demand"
              href="/demand-forecast"
              tone={demandForecastOps.forecastRevenue > 0 ? "healthy" : "default"}
              icon={<BarChart3 size={18} />}
            />
            <VyronMetricCard
              label="Forecast Production"
              value={demandForecastOps.forecastProduction > 0 ? String(Math.round(demandForecastOps.forecastProduction)) : "Monitoring"}
              note="Units forecast next month"
              href="/demand-forecast"
              tone={demandForecastOps.forecastProduction > 0 ? "healthy" : "default"}
              icon={<Factory size={18} />}
            />
            <VyronMetricCard
              label="Forecast Procurement Value"
              value={demandForecastOps.forecastProcurementValue > 0 ? formatCurrency(demandForecastOps.forecastProcurementValue) : "Monitoring"}
              note="BOM ingredient requirements"
              href="/demand-forecast"
              tone={demandForecastOps.forecastProcurementValue > 0 ? "healthy" : "default"}
              icon={<ShoppingCart size={18} />}
            />
            <VyronMetricCard
              label="Products Growing Fastest"
              value={String(demandForecastOps.productsGrowingFastest)}
              note="Growing demand trend"
              href="/demand-forecast"
              tone={demandForecastOps.productsGrowingFastest > 0 ? "healthy" : "default"}
              icon={<TrendingUp size={18} />}
            />
          </VyronMetricGrid>
          {demandForecastOps.warnings.length > 0 ? (
            <div className="mt-4 space-y-2">
              {demandForecastOps.warnings.slice(0, 4).map((warning) => (
                <div
                  key={`${warning.code}-${warning.product_id}`}
                  className="rounded-xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--vyron-warning-fg)]"
                >
                  {warning.message}
                </div>
              ))}
            </div>
          ) : null}
        </PackageGatedSection>
      ) : null}

      {mode === "onboarding" ? (
        <PackageGatedSection packageName={packageName} feature="cost_intelligence" title="AI Cost Intelligence">
          <VyronSectionHeader title="AI Cost Intelligence" />
          <VyronMetricGrid>
            <VyronMetricCard
              label="Active Insights"
              value={String(costAiOps.totalInsights)}
              note="Rules-based signals"
              href="/cost-intelligence"
              tone={costAiOps.totalInsights > 0 ? "healthy" : "default"}
              icon={<BrainCircuit size={18} />}
            />
            <VyronMetricCard
              label="Critical Risks"
              value={String(costAiOps.criticalInsights)}
              note="Requires immediate attention"
              href="/cost-intelligence"
              tone={costAiOps.criticalInsights > 0 ? "danger" : "healthy"}
              icon={<TriangleAlert size={18} />}
            />
            <VyronMetricCard
              label="High Priority"
              value={String(costAiOps.highInsights)}
              note="Elevated business impact"
              href="/cost-intelligence"
              tone={costAiOps.highInsights > 0 ? "warning" : "default"}
              icon={<TriangleAlert size={18} />}
            />
            <VyronMetricCard
              label="Top Opportunity"
              value={costAiOps.topOpportunityTitle ? "Available" : "Monitoring"}
              note={costAiOps.topOpportunityTitle || "Scanning procurement and demand"}
              href="/cost-intelligence"
              tone={costAiOps.topOpportunityTitle ? "healthy" : "default"}
              icon={<TrendingUp size={18} />}
            />
          </VyronMetricGrid>
        </PackageGatedSection>
      ) : null}

      {mode === "onboarding" ? (
        <PackageGatedSection packageName={packageName} feature="production_planning" title="Production Planning" stripe>
          <VyronSectionHeader title="Production Planning" />
          <VyronMetricGrid>
            <VyronMetricCard
              label="Production Required Today"
              value={String(productionOps.productionRequiredToday)}
              note="Units from store demand"
              href="/production-planning"
              tone={productionOps.productionRequiredToday > 0 ? "warning" : "default"}
              icon={<Factory size={18} />}
            />
            <VyronMetricCard
              label="Production Runs Open"
              value={String(productionOps.productionRunsOpen)}
              note="Draft, planned, released"
              href="/production-runs"
              tone={productionOps.productionRunsOpen > 0 ? "healthy" : "default"}
              icon={<Package size={18} />}
            />
            <VyronMetricCard
              label="Raw Material Shortages"
              value={String(productionOps.rawMaterialShortages)}
              note="BOM vs stock warnings"
              href="/production-planning"
              tone={productionOps.rawMaterialShortages > 0 ? "warning" : "healthy"}
              icon={<TriangleAlert size={18} />}
            />
          </VyronMetricGrid>
        </PackageGatedSection>
      ) : null}

      <VyronInsightCard
        eyebrow="Leakage & Recovery"
        title="Recovery Control Centre"
        status="Monitoring"
        statusTone="warning"
        icon={<ShieldCheck size={20} />}
        sideItems={["Recovery Heatmap", "Leakage Detection", "Priority Actions"]}
        rows={[
          ["Recovery scan", "Live"],
          ["Identified value", topRecovery ? `R${topRecovery.monthlyRecovery.toLocaleString("en-ZA")}` : "No Recovery Yet"],
          ["Status", "Monitoring workspace"],
        ]}
      />
      <VyronInsightCard
        eyebrow="Price Movement & Risk"
        title="Supplier Intelligence Centre"
        status="Low Risk"
        statusTone="healthy"
        icon={<Users size={20} />}
        sideItems={["Supplier Radar", "Inflation Signals", "Procurement Exposure"]}
        rows={[
          ["Suppliers tracked", counts.suppliers > 0 ? String(counts.suppliers) : "Monitoring"],
          ["Price movement", widgets?.highestIncrease ? `${widgets.highestIncrease.percentageChange.toFixed(1)}%` : "No spike detected"],
          ["Risk alerts", (risks?.length ?? 0) > 0 ? `${risks?.length ?? 0}` : "No Risk Detected"],
        ]}
      />
      <VyronInsightCard
        eyebrow="GP & Profitability"
        title="Margin Control Centre"
        status="Monitoring"
        statusTone="healthy"
        icon={<TrendingUp size={20} />}
        sideItems={["GP Monitor", "Margin Drift", "Pricing Pressure"]}
        rows={[
          ["Products live", counts.products > 0 ? String(counts.products) : "Awaiting Txns"],
          ["Ingredients", String(counts.ingredients)],
          ["Avg GP", "Monitoring"],
        ]}
      />

      <VyronSurfaceCard>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className={`flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em] ${M.muted}`}>
              <BrainCircuit size={22} className={`rounded-lg p-1.5 ${M.iconSubtle}`} />
              AI Executive Insights
            </div>
            <h2 className={`mt-2 text-2xl tracking-tight md:text-[1.65rem] ${M.heading}`}>Cost command layer</h2>
          </div>
          <div className={M.statusBrand}>
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#1F4757]" />
            AI Feed Active
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            ["Supplier Movement", "92%", "Supplier inflation signals monitoring across procurement and ingredient cost bases."],
            ["Recovery Priority", "81%", "Recovery pipeline scanning invoice variance, wastage and margin leakage across the workspace."],
            ["Margin Exposure", "74%", "Margin surveillance active — awaiting product transaction data."],
          ].map(([label, confidence, detail]) => (
            <div key={label} className={`min-h-[136px] min-w-0 ${M.dashboardWidget}`}>
              <div className="flex items-center justify-between gap-3">
                <div className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] ${M.muted}`}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#1F4757]" />
                  {label}
                </div>
                <div className="rounded-full border border-[#E2E8F0] bg-[#F6F7FB] px-2.5 py-0.5 text-[10px] font-bold text-[#334155]">
                  <span className="text-[#1F4757]">{confidence}</span> confidence
                </div>
              </div>
              <p className={`mt-3 text-sm font-medium leading-6 ${M.body}`}>{detail}</p>
            </div>
          ))}
        </div>
      </VyronSurfaceCard>

      <VyronQuoteCard
        quote={quotes[0]?.quote ?? "Executives do not need more data. They need clearer decisions."}
        attribution={quotes[0]?.label ?? "Decisions"}
      />
      <VyronFooterStrip />
    </VyronPageFrame>
  );
}
