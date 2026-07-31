"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Brain,
  Building2,
  CheckSquare,
  Gavel,
  LineChart,
  Package,
  Play,
  RefreshCcw,
  Search,
  Shield,
  ShoppingCart,
  TrendingDown,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import {
  computeAutonomousCommandSnapshot,
  type AggregatedBlocker,
  type AutonomousCommandSnapshot,
  type AutonomousRecommendation,
  type CommandPriority,
  type CommandQueueItem,
  type ExecutivePriority,
  type ExposureCategory,
  type IntelligencePipelineStage,
} from "@/lib/vyron-autonomous-command";
import type { RecipeQualityStats } from "@/lib/vyron-early-warning";
import type { RecipeRecord } from "@/lib/vyron-cost-recipes-data";
import type { ExecutiveCommandCentrePayload } from "@/lib/vyron-executive-command-centre";
import type { TenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import type { XeroConnectionState } from "@/lib/vyron-xero-integration";
import type { DecisionConfidence } from "@/lib/vyron-decisions";
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

export default function AutonomousCommandCentreClient({
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
      .catch(() => setLoadError("Could not load autonomous command intelligence."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const snapshot: AutonomousCommandSnapshot = useMemo(
    () =>
      computeAutonomousCommandSnapshot({
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
                Autonomous Command Centre
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Autonomous Command Centre</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                Executive intelligence command hub for{" "}
                <span className="font-bold text-white">{companyName}</span> · {currentPeriodLabel()}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Health:{" "}
                  <span className="text-white">
                    {snapshot.summary.healthScore != null ? `${snapshot.summary.healthScore}/100` : "—"}
                  </span>
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Confidence: <span className="text-white">{snapshot.summary.confidence}</span>
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

      {!snapshot.hasCommandData && !loading ? (
        <section className={M.moduleDataSection}>
          <h2 className="text-xl font-bold text-[#0F172A]">
            Autonomous intelligence requires additional operational data.
          </h2>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            The command centre aggregates Business Health, Early Warning, Predictive Risk, Root Cause, Decisions and
            Actions from real operational records. Load data to activate the intelligence chain.
          </p>
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
          {snapshot.isHealthy ? (
            <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6">
              <div className="flex items-start gap-3">
                <Zap size={22} className="mt-0.5 shrink-0 text-violet-700" />
                <div>
                  <h2 className="text-lg font-bold text-violet-950">Business operating within expected thresholds.</h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-violet-900">
                    No critical warnings, risks, root causes, decisions or actions require immediate executive
                    intervention.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Health Score"
              value={snapshot.summary.healthScore != null ? `${snapshot.summary.healthScore}/100` : "—"}
              accent="#8B5CF6"
            />
            <SummaryCard label="Active Warnings" value={String(snapshot.summary.activeWarnings)} accent="#A855F7" />
            <SummaryCard label="Forecast Risks" value={String(snapshot.summary.forecastRisks)} accent="#2563EB" />
            <SummaryCard label="Root Causes" value={String(snapshot.summary.rootCauses)} accent="#1D6BFF" />
            <SummaryCard label="Decisions" value={String(snapshot.summary.decisions)} accent="#3B82F6" />
            <SummaryCard label="Actions" value={String(snapshot.summary.actions)} accent="#6366F1" />
            <SummaryCard
              label="Estimated Exposure"
              value={snapshot.summary.estimatedExposure != null ? snapshot.summary.exposureLabel : "Exposure Not Yet Measurable"}
              accent="#3B82F6"
              small={snapshot.summary.estimatedExposure == null}
            />
            <SummaryCard label="Confidence" value={snapshot.summary.confidence} accent="#0F172A" />
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Executive Intelligence Chain</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Full intelligence pipeline from health monitoring through to execution.
            </p>
            <div className="mt-5 flex flex-wrap items-stretch justify-center gap-2">
              {snapshot.pipeline.map((stage, index) => (
                <div key={stage.id} className="flex items-center gap-2">
                  <PipelineStageCard stage={stage} />
                  {index < snapshot.pipeline.length - 1 ? (
                    <ArrowDown size={18} className="hidden shrink-0 text-[#94A3B8] lg:block lg:rotate-[-90deg]" />
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Intelligence Pipeline</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Stage counts, status and severity with drilldown to each intelligence centre.
            </p>
            <div className={`mt-4 ${M.tableSurface}`}>
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-sm">
                  <thead>
                    <tr className={VYRON_TABLE.head}>
                      <th className="px-4 py-3 text-left">Stage</th>
                      <th className="px-4 py-3 text-left">Count</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Severity</th>
                      <th className="px-4 py-3 text-right">Drilldown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                          Loading pipeline…
                        </td>
                      </tr>
                    ) : (
                      snapshot.pipeline.map((stage) => <PipelineTableRow key={stage.id} stage={stage} />)
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Top Executive Priorities</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Critical and high-priority items from warnings, risks, root causes, decisions and actions.
            </p>
            {snapshot.topPriorities.length === 0 ? (
              <p className="mt-4 text-sm font-medium text-[#64748B]">No critical executive priorities identified.</p>
            ) : (
              <div className={`mt-4 ${M.tableSurface}`}>
                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] w-full text-sm">
                    <thead>
                      <tr className={VYRON_TABLE.head}>
                        <th className="px-4 py-3 text-left">Priority</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-left">Reason</th>
                        <th className="px-4 py-3 text-left">Recommended Response</th>
                        <th className="px-4 py-3 text-left">Owner</th>
                        <th className="px-4 py-3 text-right">Drilldown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.topPriorities.map((row) => (
                        <PriorityRow key={row.id} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Executive Exposure Centre</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Measurable exposure breakdown across operational domains.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {snapshot.exposureCentre.map((row) => (
                <ExposureCard key={row.id} exposure={row} />
              ))}
            </div>
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Autonomous Recommendations</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Recommendations traceable to existing intelligence engines — no fabricated advice.
            </p>
            {snapshot.recommendations.length === 0 ? (
              <p className="mt-4 text-sm font-medium text-[#64748B]">No recommendations generated from current data.</p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {snapshot.recommendations.map((row) => (
                  <RecommendationCard key={row.id} recommendation={row} />
                ))}
              </div>
            )}
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Execution Readiness</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Action execution status derived from the Actions engine and dependency blockers.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ReadinessCard label="Ready" value={snapshot.executionReadiness.ready} accent="#8B5CF6" />
              <ReadinessCard label="Waiting" value={snapshot.executionReadiness.waiting} accent="#C026D3" />
              <ReadinessCard label="Blocked" value={snapshot.executionReadiness.blocked} accent="#2563EB" />
              <ReadinessCard
                label="Overall Readiness"
                value={snapshot.executionReadiness.readiness}
                accent="#1D6BFF"
                text
              />
            </div>
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Blockers & Dependencies</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Aggregated blockers from Actions, Decisions, Root Causes and Xero intelligence.
            </p>
            {snapshot.blockers.length === 0 ? (
              <p className="mt-4 text-sm font-medium text-[#64748B]">No execution blockers identified.</p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {snapshot.blockers.map((row) => (
                  <BlockerCard key={row.id} blocker={row} />
                ))}
              </div>
            )}
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Executive Command Queue</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Top 20 ranked decisions and actions by priority and impact.
            </p>
            {snapshot.commandQueue.length === 0 ? (
              <p className="mt-4 text-sm font-medium text-[#64748B]">No items in the command queue.</p>
            ) : (
              <div className={`mt-4 ${M.tableSurface}`}>
                <div className="overflow-x-auto">
                  <table className="min-w-[1000px] w-full text-sm">
                    <thead>
                      <tr className={VYRON_TABLE.head}>
                        <th className="px-4 py-3 text-left">Rank</th>
                        <th className="px-4 py-3 text-left">Priority</th>
                        <th className="px-4 py-3 text-left">Type</th>
                        <th className="px-4 py-3 text-left">Item</th>
                        <th className="px-4 py-3 text-left">Owner</th>
                        <th className="px-4 py-3 text-left">Impact</th>
                        <th className="px-4 py-3 text-left">Confidence</th>
                        <th className="px-4 py-3 text-right">Module</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.commandQueue.map((row) => (
                        <QueueRow key={row.id} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-lg font-bold text-[#0F172A]">Drilldown hub</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { label: "Executive Boardroom", href: "/executive-boardroom", icon: Building2 },
                { label: "Business Health", href: "/business-health", icon: BarChart3 },
                { label: "Early Warning", href: "/early-warning", icon: Shield },
                { label: "Predictive Risk", href: "/predictive-risk", icon: LineChart },
                { label: "Root Cause", href: "/root-cause", icon: Search },
                { label: "Decisions", href: "/decisions", icon: Gavel },
                { label: "Actions", href: "/actions", icon: CheckSquare },
                { label: "Execution Centre", href: "/execution-centre", icon: Play },
                { label: "Ask VYRON", href: "/ask-vyron", icon: Brain },
                { label: "Cost Intelligence", href: "/cost-intelligence", icon: TrendingDown },
                { label: "Products", href: "/products", icon: Package },
                { label: "Suppliers", href: "/suppliers", icon: ShoppingCart },
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

function PipelineStageCard({ stage }: { stage: IntelligencePipelineStage }) {
  return (
    <Link
      href={stage.href}
      className="block min-w-[140px] rounded-2xl border border-[#E2E8F0] bg-white p-4 text-center shadow-sm transition hover:border-[#1D6BFF]/30 hover:shadow-md"
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#1D6BFF]">{stage.label}</div>
      <div className="mt-2 text-2xl font-black text-[#0F172A]">{stage.count}</div>
      <div className="mt-1 text-xs font-semibold text-[#64748B]">{stage.status}</div>
      {stage.severity !== "None" ? (
        <div className="mt-2">
          <PriorityBadge priority={stage.severity} />
        </div>
      ) : null}
    </Link>
  );
}

function PipelineTableRow({ stage }: { stage: IntelligencePipelineStage }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{stage.label}</td>
      <td className="px-4 py-3 font-semibold text-[#334155]">{stage.count}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#64748B]">{stage.status}</td>
      <td className="px-4 py-3">
        {stage.severity !== "None" ? <PriorityBadge priority={stage.severity} /> : <span className="text-[#94A3B8]">—</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={stage.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function PriorityRow({ row }: { row: ExecutivePriority }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3">
        <PriorityBadge priority={row.priority} />
      </td>
      <td className="px-4 py-3 font-semibold text-[#1D6BFF]">{row.category}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.reason}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{row.recommendedResponse}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.owner}</td>
      <td className="px-4 py-3 text-right">
        <Link href={row.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function ExposureCard({ exposure }: { exposure: ExposureCategory }) {
  return (
    <Link
      href={exposure.href}
      className={`${M.moduleDataSection} block p-5 transition hover:border-[#1D6BFF]/30 hover:shadow-md`}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">{exposure.label}</div>
      <p className="mt-2 text-sm font-bold leading-6 text-[#0F172A]">{exposure.value}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
        View module <ArrowRight size={14} />
      </span>
    </Link>
  );
}

function RecommendationCard({ recommendation }: { recommendation: AutonomousRecommendation }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={recommendation.priority} />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#1D6BFF]">{recommendation.source}</span>
      </div>
      <h3 className="mt-2 font-bold text-[#0F172A]">{recommendation.title}</h3>
      <p className="mt-2 text-sm font-medium text-[#64748B]">{recommendation.impact}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <ConfidenceBadge confidence={recommendation.confidence} />
        <Link href={recommendation.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function ReadinessCard({
  label,
  value,
  accent,
  text,
}: {
  label: string;
  value: number | string;
  accent: string;
  text?: boolean;
}) {
  return (
    <div className={`${M.moduleDataSection} p-5`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">{label}</div>
      <div className={`mt-2 font-black ${text ? "text-xl" : "text-3xl"}`} style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function BlockerCard({ blocker }: { blocker: AggregatedBlocker }) {
  return (
    <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={blocker.severity} />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-fuchsia-800">{blocker.source}</span>
      </div>
      <h3 className="mt-2 font-bold text-fuchsia-950">{blocker.blocker}</h3>
      <p className="mt-2 text-sm font-medium text-fuchsia-900">{blocker.resolutionPath}</p>
      {blocker.affectedItems.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs font-medium text-fuchsia-900">
          {blocker.affectedItems.slice(0, 4).map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      ) : null}
      <Link href={blocker.href} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-fuchsia-900">
        Resolve <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function QueueRow({ row }: { row: CommandQueueItem }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{row.rank}</td>
      <td className="px-4 py-3">
        <PriorityBadge priority={row.priority} />
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${
            row.type === "Decision"
              ? "border-[#1D6BFF]/25 bg-[#1D6BFF]/10 text-[#1D6BFF]"
              : "border-indigo-200 bg-indigo-50 text-indigo-800"
          }`}
        >
          {row.type}
        </span>
      </td>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{row.title}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.owner}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.impact}</td>
      <td className="px-4 py-3">
        <ConfidenceBadge confidence={row.confidence} />
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={row.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function PriorityBadge({ priority }: { priority: CommandPriority }) {
  const classes: Record<CommandPriority, string> = {
    Critical: "border-rose-200 bg-rose-50 text-rose-800",
    High: "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
    Medium: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900",
    Low: "border-[#1D6BFF]/25 bg-[#1D6BFF]/10 text-[#1D6BFF]",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${classes[priority]}`}>
      {priority}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: DecisionConfidence }) {
  const classes = {
    High: "text-violet-700",
    Medium: "text-fuchsia-800",
    Low: "text-[#64748B]",
  };
  return <span className={`text-xs font-bold ${classes[confidence]}`}>{confidence}</span>;
}
