"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Brain,
  Building2,
  CheckSquare,
  Factory,
  Gavel,
  LineChart,
  Package,
  RefreshCcw,
  Search,
  Shield,
  ShoppingCart,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import {
  computeEarlyWarningSnapshot,
  type EarlyWarningItem,
  type EarlyWarningSnapshot,
  type PriorityAction,
  type RecipeQualityStats,
  type TopRiskItem,
  type WarningCategoryCard,
  type WarningSeverity,
} from "@/lib/vyron-early-warning";
import type { RecipeRecord } from "@/lib/vyron-cost-recipes-data";
import type { ExecutiveCommandCentrePayload } from "@/lib/vyron-executive-command-centre";
import type { TenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import type { XeroConnectionState } from "@/lib/vyron-xero-integration";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";

const M = VYRON_MASTER;

type InvoiceSummary = {
  monthlySales: number;
  monthlyGpPct: number;
  invoiceCount: number;
  uniqueCustomers: number;
};

function currentPeriodLabel() {
  return new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function computeRecipeQuality(recipes: RecipeRecord[]): RecipeQualityStats {
  const totalRecipes = recipes.length;
  const recipesWithoutLines = recipes.filter((row) => !row.lines?.length).length;
  const recipesWithoutCosting = recipes.filter((row) => !Number(row.total_cost)).length;
  return { totalRecipes, recipesWithoutLines, recipesWithoutCosting };
}

export default function EarlyWarningCentreClient({
  intelligence,
  companyName,
}: {
  intelligence: TenantCostIntelligence | null;
  companyName: string;
}) {
  const [commandData, setCommandData] = useState<ExecutiveCommandCentrePayload | null>(null);
  const [xeroConnection, setXeroConnection] = useState<XeroConnectionState | null>(null);
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary | null>(null);
  const [recipeQuality, setRecipeQuality] = useState<RecipeQualityStats | null>(null);
  const [invoiceSyncReady, setInvoiceSyncReady] = useState(false);
  const [xeroQueueFailed, setXeroQueueFailed] = useState(0);
  const [xeroQueueReady, setXeroQueueReady] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setLoadError(null);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    Promise.all([
      fetch("/api/executive/command-centre").then((r) => r.json()),
      fetch("/api/integrations/xero/connection").then((r) => r.json()),
      fetch("/api/integrations/xero/sync-queue").then((r) => r.json()),
      fetch("/api/integrations/xero/mapping").then((r) => r.json()),
      fetch("/api/customer-invoices").then((r) => r.json()),
      fetch("/api/recipes").then((r) => r.json()),
    ])
      .then(([commandRes, xeroRes, queueRes, mappingRes, invoiceRes, recipesRes]) => {
        if (commandRes.ok && commandRes.data) {
          setCommandData(commandRes.data as ExecutiveCommandCentrePayload);
        } else {
          setCommandData(null);
        }

        if (xeroRes.ok) {
          setXeroConnection(xeroRes.connection || null);
        } else {
          setXeroConnection(null);
        }

        if (queueRes.ok && Array.isArray(queueRes.items)) {
          const items = queueRes.items as Array<{ status: string }>;
          setXeroQueueFailed(items.filter((row) => row.status === "Failed").length);
          setXeroQueueReady(items.filter((row) => row.status === "Ready").length);
        } else {
          setXeroQueueFailed(0);
          setXeroQueueReady(0);
        }

        if (mappingRes.ok) {
          setInvoiceSyncReady(Boolean(mappingRes.invoiceSyncReady));
        }

        if (recipesRes.ok && Array.isArray(recipesRes.recipes)) {
          setRecipeQuality(computeRecipeQuality(recipesRes.recipes as RecipeRecord[]));
        } else {
          setRecipeQuality(null);
        }

        if (invoiceRes.ok && Array.isArray(invoiceRes.invoices)) {
          const posted = invoiceRes.invoices.filter(
            (inv: {
              status?: string;
              stock_posted?: boolean;
              invoice_date?: string;
              customer_id?: string | null;
              customer_name?: string;
            }) => {
              const status = String(inv.status || "");
              const postedStatus = inv.stock_posted || ["Posted", "Sent", "Paid"].includes(status);
              if (!postedStatus || !inv.invoice_date) return false;
              return new Date(inv.invoice_date) >= monthStart;
            }
          );
          const monthlySales = posted.reduce(
            (sum: number, inv: { sales_value?: number }) => sum + Number(inv.sales_value || 0),
            0
          );
          const gpWeighted = posted.reduce(
            (acc: { sales: number; gp: number }, inv: { sales_value?: number; gross_profit?: number }) => {
              const sales = Number(inv.sales_value || 0);
              return { sales: acc.sales + sales, gp: acc.gp + Number(inv.gross_profit || 0) };
            },
            { sales: 0, gp: 0 }
          );
          const uniqueCustomers = new Set(
            posted.map((inv: { customer_id?: string | null; customer_name?: string }) =>
              String(inv.customer_id || inv.customer_name || "")
            )
          ).size;

          setInvoiceSummary({
            monthlySales,
            monthlyGpPct: gpWeighted.sales > 0 ? (gpWeighted.gp / gpWeighted.sales) * 100 : 0,
            invoiceCount: posted.length,
            uniqueCustomers,
          });
        } else {
          setInvoiceSummary(null);
        }

        setLastRefresh(new Date().toISOString());
      })
      .catch(() => setLoadError("Could not load early warning data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const snapshot: EarlyWarningSnapshot = useMemo(
    () =>
      computeEarlyWarningSnapshot({
        intelligence,
        commandData,
        xeroConnection,
        invoiceSummary,
        invoiceSyncReady,
        xeroQueueFailed,
        xeroQueueReady,
        recipeQuality,
      }),
    [
      intelligence,
      commandData,
      xeroConnection,
      invoiceSummary,
      invoiceSyncReady,
      xeroQueueFailed,
      xeroQueueReady,
      recipeQuality,
    ]
  );

  return (
    <div className="space-y-6">
      <header className={M.moduleHeaderNavy}>
        <div className={`relative p-1 md:p-2 ${M.dashboardHeroInner}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#3B82F6]/35 bg-[#3B82F6]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#FECDD3]">
                Early Warning Centre
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Early Warning Centre</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                Problems detected before they become expensive — margin, supplier, inventory, procurement,
                manufacturing, customer and Xero risks for{" "}
                <span className="font-bold text-white">{companyName}</span> · {currentPeriodLabel()}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Active warnings:{" "}
                  <span className="text-white">
                    {snapshot.summary.critical +
                      snapshot.summary.high +
                      snapshot.summary.medium +
                      snapshot.summary.low}
                  </span>
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Critical: <span className="text-white">{snapshot.summary.critical}</span>
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Last refresh:{" "}
                  <span className="text-white">
                    {lastRefresh
                      ? new Date(lastRefresh).toLocaleString("en-ZA", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : loading
                        ? "Loading…"
                        : "—"}
                  </span>
                </span>
              </div>
            </div>
            <button type="button" onClick={refresh} className={`shrink-0 ${M.secondaryBtn} px-4 py-2 text-sm`}>
              <RefreshCcw size={16} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {loadError}
        </div>
      ) : null}

      {!snapshot.hasMonitoringData && !loading ? (
        <section className={M.moduleDataSection}>
          <h2 className="text-xl font-bold text-[#0F172A]">Early warning monitoring not available yet</h2>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Load operational data so VYRON COST can detect margin, supplier, inventory, procurement, manufacturing,
            customer and Xero risks.
          </p>
          <ul className="mt-4 space-y-2 text-sm font-medium text-[#334155]">
            <li>· Create products with costs, selling prices and target GP</li>
            <li>· Create recipes / BOMs with ingredient costing</li>
            <li>· Import suppliers and process GRNs</li>
            <li>· Maintain inventory stock and movements</li>
            <li>· Post customer invoices and connect Xero</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/products" className={`${M.primaryBtn} px-4 py-2 text-sm`}>
              Create Products
            </Link>
            <Link href="/recipes" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Create Recipes
            </Link>
            <Link href="/suppliers" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Import Suppliers
            </Link>
            <Link href="/purchase-orders" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Process GRNs
            </Link>
            <Link href="/integrations/xero" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Connect Xero
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Critical Warnings" value={String(snapshot.summary.critical)} accent="#2563EB" />
            <SummaryCard label="High Warnings" value={String(snapshot.summary.high)} accent="#A855F7" />
            <SummaryCard label="Medium Warnings" value={String(snapshot.summary.medium)} accent="#C026D3" />
            <SummaryCard label="Low Warnings" value={String(snapshot.summary.low)} accent="#1D6BFF" />
            <SummaryCard
              label="Potential Exposure"
              value={
                snapshot.summary.potentialExposure != null
                  ? snapshot.summary.exposureLabel
                  : "Exposure Not Yet Measurable"
              }
              accent="#0F172A"
              small={snapshot.summary.potentialExposure == null}
            />
          </section>

          {snapshot.warnings.length === 0 ? (
            <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6">
              <div className="flex items-start gap-3">
                <Shield size={22} className="mt-0.5 shrink-0 text-violet-700" />
                <div>
                  <h2 className="text-lg font-bold text-violet-950">No Active Warnings Detected</h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-violet-900">
                    Current product, supplier, inventory, procurement, manufacturing, customer and Xero data show no
                    material early-warning signals.
                  </p>
                  <p className="mt-3 text-sm font-medium text-violet-900">VYRON is monitoring:</p>
                  <ul className="mt-2 space-y-1 text-sm font-medium text-violet-900">
                    <li>· Margin erosion and missing price/cost data</li>
                    <li>· Supplier price movement and procurement variances</li>
                    <li>· Inventory low stock, overstock and slow-moving items</li>
                    <li>· Manufacturing wastage and BOM cost movement</li>
                    <li>· Customer invoice GP and concentration</li>
                    <li>· Xero connection, mapping and sync queue health</li>
                  </ul>
                  <p className="mt-3 text-sm font-medium text-violet-900">Additional data that improves detection:</p>
                  <ul className="mt-2 space-y-1 text-sm font-medium text-violet-900">
                    <li>· Complete product costs, selling prices and BOM structures</li>
                    <li>· Supplier price history from GRNs and purchase orders</li>
                    <li>· Posted customer invoices and connected Xero sync</li>
                  </ul>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Live Warning Feed</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Ranked warnings from live operational and integration data — no placeholders.
                </p>
                <div className={`mt-4 ${M.tableSurface}`}>
                  <div className="overflow-x-auto">
                    <table className="min-w-[1200px] w-full text-sm">
                      <thead>
                        <tr className={VYRON_TABLE.head}>
                          <th className="px-4 py-3 text-left">Severity</th>
                          <th className="px-4 py-3 text-left">Category</th>
                          <th className="px-4 py-3 text-left">Warning</th>
                          <th className="px-4 py-3 text-left">Description</th>
                          <th className="px-4 py-3 text-left">Impact</th>
                          <th className="px-4 py-3 text-left">Confidence</th>
                          <th className="px-4 py-3 text-left">Source</th>
                          <th className="px-4 py-3 text-left">Recommended Action</th>
                          <th className="px-4 py-3 text-right">Drilldown</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td colSpan={9} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                              Loading warnings…
                            </td>
                          </tr>
                        ) : (
                          snapshot.warnings.map((warning) => <WarningRow key={warning.id} warning={warning} />)
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-lg font-bold text-[#0F172A]">Warning Category Cards</h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {snapshot.categoryCards.map((card) => (
                    <CategoryCard key={card.id} card={card} />
                  ))}
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Priority Actions</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Top 10 recommended actions from the highest-severity warnings.
                </p>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {snapshot.priorityActions.map((action) => (
                    <PriorityActionCard key={action.id} action={action} />
                  ))}
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Data Quality Centre</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Gaps in products, BOMs, suppliers, customers, inventory and Xero that weaken early-warning detection.
                </p>
                {snapshot.dataQualityWarnings.length === 0 ? (
                  <p className="mt-4 text-sm font-semibold text-violet-700">No data quality warnings on current records.</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {snapshot.dataQualityWarnings.map((warning) => (
                      <DataQualityRow key={warning.id} warning={warning} />
                    ))}
                  </div>
                )}
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Top Risks</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Top 10 business risks sorted Critical → High → Medium → Low.
                </p>
                <div className={`mt-4 ${M.tableSurface}`}>
                  <div className="overflow-x-auto">
                    <table className="min-w-[900px] w-full text-sm">
                      <thead>
                        <tr className={VYRON_TABLE.head}>
                          <th className="px-4 py-3 text-left">Risk</th>
                          <th className="px-4 py-3 text-left">Severity</th>
                          <th className="px-4 py-3 text-left">Business Impact</th>
                          <th className="px-4 py-3 text-left">Confidence</th>
                          <th className="px-4 py-3 text-left">Recommended Response</th>
                          <th className="px-4 py-3 text-right">Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.topRisks.length === 0 ? (
                          <tr>
                            <td colSpan={6} className={`px-4 py-8 text-center ${VYRON_TABLE.empty}`}>
                              No ranked risks on current data.
                            </td>
                          </tr>
                        ) : (
                          snapshot.topRisks.map((risk) => <TopRiskRow key={risk.id} risk={risk} />)
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </>
          )}

          <section className={M.moduleDataSection}>
            <h2 className="text-lg font-bold text-[#0F172A]">Executive drilldowns</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { label: "Executive Boardroom", href: "/executive-boardroom", icon: Building2 },
                { label: "Cost Intelligence", href: "/cost-intelligence", icon: TrendingDown },
                { label: "Business Health", href: "/business-health", icon: BarChart3 },
                { label: "Predictive Risk", href: "/predictive-risk", icon: LineChart },
                { label: "Root Cause", href: "/root-cause", icon: Search },
                { label: "Decisions", href: "/decisions", icon: Gavel },
                { label: "Actions", href: "/actions", icon: CheckSquare },
                { label: "Autonomous Command", href: "/autonomous-command-centre", icon: Brain },
                { label: "Product margins", href: "/reports/product-margins", icon: TrendingDown },
                { label: "Products", href: "/products", icon: Package },
                { label: "Suppliers", href: "/suppliers", icon: ShoppingCart },
                { label: "Purchase orders", href: "/purchase-orders", icon: ShoppingCart },
                { label: "Inventory stock", href: "/inventory/stock", icon: Package },
                { label: "Customer invoices", href: "/customer-invoices", icon: Users },
                { label: "Xero integration", href: "/integrations/xero", icon: Wallet },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F6F7FB] px-4 py-2 text-sm font-semibold text-[#334155] transition hover:border-[#1D6BFF]/30 hover:text-[#1D6BFF]"
                >
                  <link.icon size={16} />
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string;
  accent: string;
  small?: boolean;
}) {
  return (
    <div className={`${M.moduleDataSection} p-5`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">{label}</div>
      <div
        className={`mt-2 font-black text-[#0F172A] ${small ? "text-sm leading-6" : "text-2xl"}`}
        style={{ color: small ? "#0F172A" : accent }}
      >
        {value}
      </div>
    </div>
  );
}

function WarningRow({ warning }: { warning: EarlyWarningItem }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3">
        <SeverityBadge severity={warning.severity} />
      </td>
      <td className="px-4 py-3 font-semibold text-[#1D6BFF]">{warning.category}</td>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{warning.title}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#64748B]">{warning.description}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{warning.impact}</td>
      <td className="px-4 py-3">
        <ConfidenceBadge confidence={warning.confidence} />
      </td>
      <td className="px-4 py-3 text-xs font-medium text-[#64748B]">{warning.sourceData}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{warning.recommendedAction}</td>
      <td className="px-4 py-3 text-right">
        <Link href={warning.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function TopRiskRow({ risk }: { risk: TopRiskItem }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{risk.risk}</td>
      <td className="px-4 py-3">
        <SeverityBadge severity={risk.severity} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{risk.businessImpact}</td>
      <td className="px-4 py-3">
        <ConfidenceBadge confidence={risk.confidence} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{risk.recommendedResponse}</td>
      <td className="px-4 py-3 text-right">
        <Link href={risk.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function CategoryCard({ card }: { card: WarningCategoryCard }) {
  const icons: Record<string, typeof Package> = {
    margin: TrendingDown,
    supplier: ShoppingCart,
    inventory: Package,
    procurement: ShoppingCart,
    manufacturing: Factory,
    customer: Users,
    xero: Wallet,
    "data-quality": AlertTriangle,
  };
  const Icon = icons[card.id] || Shield;

  return (
    <Link
      href={card.href}
      className={`${M.moduleDataSection} block p-5 transition hover:border-[#1D6BFF]/30 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center ${M.iconSubtle}`}>
              <Icon size={18} className="text-[#1D6BFF]" />
            </div>
            <h3 className="font-bold text-[#0F172A]">{card.label}</h3>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-2xl font-black text-[#0F172A]">{card.count}</span>
            {card.highestSeverity !== "None" ? <SeverityBadge severity={card.highestSeverity} /> : null}
          </div>
          <p className="mt-2 text-sm font-medium text-[#64748B]">{card.mainIssue}</p>
        </div>
        <ArrowRight size={18} className="shrink-0 text-[#94A3B8]" />
      </div>
    </Link>
  );
}

function PriorityActionCard({ action }: { action: PriorityAction }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full vyron-grad-surface text-[10px] font-bold text-white">
              {action.priority}
            </span>
            <SeverityBadge severity={action.severity} />
          </div>
          <div className="mt-2 font-bold text-[#0F172A]">{action.title}</div>
          <p className="mt-1 text-sm font-medium text-[#64748B]">{action.explanation}</p>
          <p className="mt-2 text-xs font-semibold text-[#334155]">Expected outcome: {action.outcome}</p>
        </div>
      </div>
      <Link href={action.href} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
        Open module <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function DataQualityRow({ warning }: { warning: EarlyWarningItem }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={warning.severity} />
          <span className="font-bold text-[#0F172A]">{warning.title}</span>
        </div>
        <p className="mt-1 text-sm font-medium text-[#64748B]">{warning.description}</p>
        <p className="mt-1 text-xs font-medium text-[#94A3B8]">{warning.sourceData}</p>
      </div>
      <Link href={warning.href} className="shrink-0 text-xs font-bold text-[#1D6BFF]">
        Fix →
      </Link>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: WarningSeverity }) {
  const classes: Record<WarningSeverity, string> = {
    Critical: "border-rose-200 bg-rose-50 text-rose-800",
    High: "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
    Medium: "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
    Low: "border-[#1D6BFF]/25 bg-[#1D6BFF]/10 text-[#1D6BFF]",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${classes[severity]}`}>
      {severity}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: EarlyWarningItem["confidence"] }) {
  const classes = {
    High: "text-violet-700",
    Medium: "text-[var(--vyron-warning-fg)]",
    Low: "text-[#64748B]",
  };
  return <span className={`text-xs font-bold ${classes[confidence]}`}>{confidence}</span>;
}
