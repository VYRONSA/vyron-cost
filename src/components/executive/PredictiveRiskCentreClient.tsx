"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Building2,
  CheckSquare,
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
  computePredictiveRiskSnapshot,
  type ForecastedRisk,
  type FutureRiskItem,
  type HeatmapRisk,
  type PredictiveModel,
  type PredictiveRiskSnapshot,
  type PreventiveAction,
  type ScenarioItem,
} from "@/lib/vyron-predictive-risk";
import type { RecipeQualityStats } from "@/lib/vyron-early-warning";
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

export default function PredictiveRiskCentreClient({
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
      .catch(() => setLoadError("Could not load predictive risk data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const snapshot: PredictiveRiskSnapshot = useMemo(
    () =>
      computePredictiveRiskSnapshot({
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
                Predictive Risk Centre
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Predictive Risk Centre</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                What is likely to happen next if nothing changes — forecast risks for{" "}
                <span className="font-bold text-white">{companyName}</span> · {currentPeriodLabel()} ·{" "}
                {snapshot.summary.outlookLabel}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Forecast horizon: <span className="text-white">{snapshot.summary.forecastHorizon}</span>
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Confidence: <span className="text-white">{snapshot.summary.confidenceLevel}</span>
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

      {!snapshot.hasForecastData && !loading ? (
        <section className={M.moduleDataSection}>
          <h2 className="text-xl font-bold text-[#0F172A]">Predictive forecasting requires additional operational data.</h2>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Forecasts are derived from current warnings, health scores and operational signals. Load data to enable
            predictive risk modelling.
          </p>
          <ul className="mt-4 space-y-2 text-sm font-medium text-[#334155]">
            <li>· Create products with costs, selling prices and target GP</li>
            <li>· Create BOMs with ingredient costing</li>
            <li>· Process inventory movements</li>
            <li>· Post customer invoices</li>
            <li>· Connect Xero</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/products" className={`${M.primaryBtn} px-4 py-2 text-sm`}>
              Create Products
            </Link>
            <Link href="/recipes" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Create BOMs
            </Link>
            <Link href="/inventory/stock" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Process Inventory
            </Link>
            <Link href="/customer-invoices" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Process Invoices
            </Link>
            <Link href="/integrations/xero" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Connect Xero
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              label="Critical Forecast Risks"
              value={String(snapshot.summary.criticalForecastRisks)}
              accent="#2563EB"
            />
            <SummaryCard label="High Forecast Risks" value={String(snapshot.summary.highForecastRisks)} accent="#A855F7" />
            <SummaryCard
              label="Forecast Exposure"
              value={
                snapshot.summary.forecastExposure != null
                  ? snapshot.summary.forecastExposureLabel
                  : "Exposure Not Yet Measurable"
              }
              accent="#0F172A"
              small={snapshot.summary.forecastExposure == null}
            />
            <SummaryCard label="Confidence Level" value={snapshot.summary.confidenceLevel} accent="#1D6BFF" />
            <SummaryCard label="Forecast Horizon" value={snapshot.summary.outlookLabel} accent="#3B82F6" small />
          </section>

          {snapshot.forecastedRisks.length === 0 ? (
            <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6">
              <div className="flex items-start gap-3">
                <LineChart size={22} className="mt-0.5 shrink-0 text-violet-700" />
                <div>
                  <h2 className="text-lg font-bold text-violet-950">No significant forecast risks detected.</h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-violet-900">
                    Current operational signals show no material forward-looking risk escalation within the{" "}
                    {snapshot.summary.forecastHorizon.toLowerCase()} horizon.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Forecasted Risks</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Forward-looking risks derived from current warnings, health scores and operational signals.
                </p>
                <div className={`mt-4 ${M.tableSurface}`}>
                  <div className="overflow-x-auto">
                    <table className="min-w-[1200px] w-full text-sm">
                      <thead>
                        <tr className={VYRON_TABLE.head}>
                          <th className="px-4 py-3 text-left">Risk</th>
                          <th className="px-4 py-3 text-left">Category</th>
                          <th className="px-4 py-3 text-left">Current Status</th>
                          <th className="px-4 py-3 text-left">Forecasted Outcome</th>
                          <th className="px-4 py-3 text-left">Severity</th>
                          <th className="px-4 py-3 text-left">Confidence</th>
                          <th className="px-4 py-3 text-left">Forecast Horizon</th>
                          <th className="px-4 py-3 text-left">Recommended Action</th>
                          <th className="px-4 py-3 text-right">Drilldown</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td colSpan={9} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                              Loading forecasts…
                            </td>
                          </tr>
                        ) : (
                          snapshot.forecastedRisks.map((row) => <ForecastRow key={row.id} row={row} />)
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Predictive Risk Models</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Traceable forecast models generated only when supported by current tenant data.
                </p>
                {snapshot.models.length === 0 ? (
                  <p className="mt-4 text-sm font-semibold text-[#64748B]">
                    No composite forecast models triggered on current signals.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {snapshot.models.map((model) => (
                      <ModelCard key={model.id} model={model} />
                    ))}
                  </div>
                )}
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Top Future Risks</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Top 10 future risks sorted Critical → High → Medium → Low.
                </p>
                <div className={`mt-4 ${M.tableSurface}`}>
                  <div className="overflow-x-auto">
                    <table className="min-w-[900px] w-full text-sm">
                      <thead>
                        <tr className={VYRON_TABLE.head}>
                          <th className="px-4 py-3 text-left">Risk</th>
                          <th className="px-4 py-3 text-left">Severity</th>
                          <th className="px-4 py-3 text-left">Confidence</th>
                          <th className="px-4 py-3 text-left">Expected Impact</th>
                          <th className="px-4 py-3 text-left">Time Horizon</th>
                          <th className="px-4 py-3 text-left">Recommended Response</th>
                          <th className="px-4 py-3 text-right">Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.topFutureRisks.map((row) => (
                          <FutureRiskRow key={row.id} row={row} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Scenario Centre</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Descriptive scenarios based on current signals — no invented financial values.
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {snapshot.scenarios.map((scenario) => (
                    <ScenarioCard key={scenario.id} scenario={scenario} />
                  ))}
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Risk Heatmap</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Likelihood vs impact positioning from current warning signals by category.
                </p>
                {snapshot.heatmap.length === 0 ? (
                  <p className="mt-4 text-sm font-semibold text-[#64748B]">No category risks to position on the heatmap.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <HeatmapGrid risks={snapshot.heatmap} />
                  </div>
                )}
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Recommended Preventive Actions</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Top 10 preventative actions to reduce forecast risk escalation.
                </p>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {snapshot.preventiveActions.map((action) => (
                    <PreventiveActionCard key={action.id} action={action} />
                  ))}
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
                { label: "Early Warning", href: "/early-warning", icon: Shield },
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

function ForecastRow({ row }: { row: ForecastedRisk }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{row.risk}</td>
      <td className="px-4 py-3 font-semibold text-[#1D6BFF]">{row.category}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#64748B]">{row.currentStatus}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.forecastedOutcome}</td>
      <td className="px-4 py-3">
        <SeverityBadge severity={row.severity} />
      </td>
      <td className="px-4 py-3">
        <ConfidenceBadge confidence={row.confidence} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#64748B]">{row.forecastHorizon}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.recommendedAction}</td>
      <td className="px-4 py-3 text-right">
        <Link href={row.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function FutureRiskRow({ row }: { row: FutureRiskItem }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{row.risk}</td>
      <td className="px-4 py-3">
        <SeverityBadge severity={row.severity} />
      </td>
      <td className="px-4 py-3">
        <ConfidenceBadge confidence={row.confidence} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.expectedImpact}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#64748B]">{row.timeHorizon}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.recommendedResponse}</td>
      <td className="px-4 py-3 text-right">
        <Link href={row.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function ModelCard({ model }: { model: PredictiveModel }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#1D6BFF]">{model.category}</div>
          <h3 className="mt-1 font-bold text-[#0F172A]">{model.title}</h3>
        </div>
        <ConfidenceBadge confidence={model.confidence} />
      </div>
      <p className="mt-3 text-sm font-bold text-[#334155]">{model.forecast}</p>
      <div className="mt-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">Conditions met</div>
        <ul className="mt-2 space-y-1">
          {model.conditions.map((condition) => (
            <li key={condition} className="text-sm font-medium text-[#64748B]">
              · {condition}
            </li>
          ))}
        </ul>
      </div>
      <Link href={model.href} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
        Open module <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: ScenarioItem }) {
  const accent =
    scenario.title === "Best Case"
      ? "border-violet-200 bg-violet-50"
      : scenario.title === "Worst Case"
        ? "border-rose-200 bg-rose-50"
        : "border-[#E2E8F0] bg-[#F8FAFC]";

  return (
    <div className={`rounded-2xl border p-5 ${accent}`}>
      <h3 className="font-bold text-[#0F172A]">{scenario.title}</h3>
      <p className="mt-2 text-sm font-medium leading-6 text-[#334155]">{scenario.summary}</p>
      <div className="mt-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">Based on</div>
        <ul className="mt-2 space-y-1">
          {scenario.signals.map((signal) => (
            <li key={signal} className="text-sm font-medium text-[#64748B]">
              · {signal}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function HeatmapGrid({ risks }: { risks: HeatmapRisk[] }) {
  const likelihoods = ["High", "Medium", "Low"] as const;
  const impacts = ["Critical", "High", "Medium", "Low"] as const;

  const impactColors: Record<string, string> = {
    Critical: "bg-rose-100 border-rose-300",
    High: "bg-orange-100 border-orange-300",
    Medium: "bg-fuchsia-100 border-fuchsia-300",
    Low: "bg-[#F6F7FB] border-[#E2E8F0]",
  };

  return (
    <div className="min-w-[640px]">
      <div className="grid grid-cols-[100px_repeat(3,1fr)] gap-2">
        <div />
        {likelihoods.map((likelihood) => (
          <div key={likelihood} className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">
            {likelihood} Likelihood
          </div>
        ))}
        {impacts.map((impact) => (
          <Fragment key={impact}>
            <div className="flex items-center text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">
              {impact} Impact
            </div>
            {likelihoods.map((likelihood) => {
              const cellRisks = risks.filter((row) => row.likelihood === likelihood && row.impact === impact);
              return (
                <div
                  key={`${impact}-${likelihood}`}
                  className={`min-h-[88px] rounded-xl border p-2 ${impactColors[impact]}`}
                >
                  {cellRisks.length === 0 ? (
                    <span className="text-xs font-medium text-[#94A3B8]">—</span>
                  ) : (
                    <div className="space-y-1">
                      {cellRisks.map((row) => (
                        <Link
                          key={row.id}
                          href={row.href}
                          className="block rounded-lg bg-white/80 px-2 py-1 text-xs font-semibold text-[#334155] hover:text-[#1D6BFF]"
                        >
                          {row.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function PreventiveActionCard({ action }: { action: PreventiveAction }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full vyron-grad-surface text-[10px] font-bold text-white">
          {action.priority}
        </span>
        <div className="font-bold text-[#0F172A]">{action.title}</div>
      </div>
      <p className="mt-2 text-sm font-medium text-[#64748B]">{action.whyItMatters}</p>
      <p className="mt-2 text-xs font-semibold text-[#334155]">Expected benefit: {action.expectedBenefit}</p>
      <Link href={action.href} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
        Open module <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: ForecastedRisk["severity"] }) {
  const classes: Record<ForecastedRisk["severity"], string> = {
    Critical: "border-rose-200 bg-rose-50 text-rose-800",
    High: "border-orange-200 bg-orange-50 text-orange-900",
    Medium: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900",
    Low: "border-[#1D6BFF]/25 bg-[#1D6BFF]/10 text-[#1D6BFF]",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${classes[severity]}`}>
      {severity}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: ForecastedRisk["confidence"] }) {
  const classes = {
    High: "text-violet-700",
    Medium: "text-fuchsia-800",
    Low: "text-[#64748B]",
  };
  return <span className={`text-xs font-bold ${classes[confidence]}`}>{confidence}</span>;
}
