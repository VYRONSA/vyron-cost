"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Building2,
  CheckSquare,
  Gavel,
  GitBranch,
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
  computeRootCauseSnapshot,
  type CauseTree,
  type CorrectiveAction,
  type EvidenceItem,
  type RecurringCause,
  type RootCauseCluster,
  type RootCauseInvestigation,
  type RootCauseSnapshot,
} from "@/lib/vyron-root-cause";
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

export default function RootCauseCentreClient({
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
      .catch(() => setLoadError("Could not load root cause data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const snapshot: RootCauseSnapshot = useMemo(
    () =>
      computeRootCauseSnapshot({
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
                Root Cause Centre
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Root Cause Centre</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                Identify why business problems exist — traceable root causes for margins, costs, suppliers, inventory
                and profitability for <span className="font-bold text-white">{companyName}</span> ·{" "}
                {currentPeriodLabel()}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Investigations: <span className="text-white">{snapshot.investigations.length}</span>
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

      {!snapshot.hasAnalysisData && !loading ? (
        <section className={M.moduleDataSection}>
          <h2 className="text-xl font-bold text-[#0F172A]">Root cause analysis requires additional operational data.</h2>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Root causes are derived from Early Warning signals, Business Health scores and Predictive Risk forecasts.
            Load operational data to enable traceable investigations.
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
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              label="Critical Root Causes"
              value={String(snapshot.summary.criticalRootCauses)}
              accent="#2563EB"
            />
            <SummaryCard label="High Impact Causes" value={String(snapshot.summary.highImpactCauses)} accent="#A855F7" />
            <SummaryCard label="Categories Affected" value={String(snapshot.summary.categoriesAffected)} accent="#1D6BFF" />
            <SummaryCard
              label="Estimated Exposure"
              value={
                snapshot.summary.estimatedExposure != null
                  ? snapshot.summary.exposureLabel
                  : "Exposure Not Yet Measurable"
              }
              accent="#0F172A"
              small={snapshot.summary.estimatedExposure == null}
            />
            <SummaryCard label="Confidence Level" value={snapshot.summary.confidenceLevel} accent="#3B82F6" />
          </section>

          {snapshot.investigations.length === 0 ? (
            <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6">
              <div className="flex items-start gap-3">
                <Search size={22} className="mt-0.5 shrink-0 text-violet-700" />
                <div>
                  <h2 className="text-lg font-bold text-violet-950">No significant root causes identified.</h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-violet-900">
                    Current operational signals do not indicate material traceable root causes on available data.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Root Cause Investigations</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Problems traced to underlying causes with supporting evidence — no invented causes.
                </p>
                <div className={`mt-4 ${M.tableSurface}`}>
                  <div className="overflow-x-auto">
                    <table className="min-w-[1200px] w-full text-sm">
                      <thead>
                        <tr className={VYRON_TABLE.head}>
                          <th className="px-4 py-3 text-left">Problem</th>
                          <th className="px-4 py-3 text-left">Root Cause</th>
                          <th className="px-4 py-3 text-left">Category</th>
                          <th className="px-4 py-3 text-left">Evidence</th>
                          <th className="px-4 py-3 text-left">Confidence</th>
                          <th className="px-4 py-3 text-left">Estimated Impact</th>
                          <th className="px-4 py-3 text-left">Recommended Resolution</th>
                          <th className="px-4 py-3 text-right">Drilldown</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td colSpan={8} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                              Loading investigations…
                            </td>
                          </tr>
                        ) : (
                          snapshot.investigations.map((row) => <InvestigationRow key={row.id} row={row} />)
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Cause Trees</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Visual investigation chains derived from actual tenant signals.
                </p>
                {snapshot.causeTrees.length === 0 ? (
                  <p className="mt-4 text-sm font-semibold text-[#64748B]">No multi-step cause chains on current data.</p>
                ) : (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {snapshot.causeTrees.map((tree) => (
                      <CauseTreeCard key={tree.id} tree={tree} />
                    ))}
                  </div>
                )}
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Root Cause Clusters</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Grouped causes by pricing, supplier, inventory, manufacturing, customer, financial and data quality.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {snapshot.clusters
                    .filter((cluster) => cluster.problemCount > 0)
                    .map((cluster) => (
                      <ClusterCard key={cluster.id} cluster={cluster} />
                    ))}
                </div>
                {snapshot.clusters.every((cluster) => cluster.problemCount === 0) ? (
                  <p className="mt-4 text-sm font-semibold text-[#64748B]">No clustered causes on current data.</p>
                ) : null}
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Evidence Centre</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Supporting evidence for every root cause investigation.
                </p>
                <div className="mt-4 space-y-2">
                  {snapshot.evidence.map((item) => (
                    <EvidenceRow key={item.id} item={item} />
                  ))}
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Corrective Actions</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Top 10 corrective actions ranked by severity and impact.
                </p>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {snapshot.correctiveActions.map((action) => (
                    <CorrectiveActionCard key={action.id} action={action} />
                  ))}
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Recurring Causes</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Causes appearing across Early Warning, Predictive Risk and Business Health signals.
                </p>
                {snapshot.recurringCauses.length === 0 ? (
                  <p className="mt-4 text-sm font-semibold text-[#64748B]">No recurring causes identified yet.</p>
                ) : (
                  <div className={`mt-4 ${M.tableSurface}`}>
                    <div className="overflow-x-auto">
                      <table className="min-w-[700px] w-full text-sm">
                        <thead>
                          <tr className={VYRON_TABLE.head}>
                            <th className="px-4 py-3 text-left">Cause</th>
                            <th className="px-4 py-3 text-left">Frequency</th>
                            <th className="px-4 py-3 text-left">Severity</th>
                            <th className="px-4 py-3 text-left">Sources</th>
                            <th className="px-4 py-3 text-right">Open</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.recurringCauses.map((cause) => (
                            <RecurringCauseRow key={cause.id} cause={cause} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
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
                { label: "Predictive Risk", href: "/predictive-risk", icon: LineChart },
                { label: "Decisions", href: "/decisions", icon: Gavel },
                { label: "Actions", href: "/actions", icon: CheckSquare },
                { label: "Autonomous Command", href: "/autonomous-command-centre", icon: Brain },
                { label: "Products", href: "/products", icon: Package },
                { label: "Suppliers", href: "/suppliers", icon: ShoppingCart },
                { label: "Inventory stock", href: "/inventory/stock", icon: Package },
                { label: "Purchase orders", href: "/purchase-orders", icon: ShoppingCart },
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

function InvestigationRow({ row }: { row: RootCauseInvestigation }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{row.problem}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.rootCause}</td>
      <td className="px-4 py-3 font-semibold text-[#1D6BFF]">{row.category}</td>
      <td className="px-4 py-3 text-xs font-medium text-[#64748B]">
        <ul className="space-y-1">
          {row.evidence.slice(0, 3).map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </td>
      <td className="px-4 py-3">
        <ConfidenceBadge confidence={row.confidence} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.estimatedImpact}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.recommendedResolution}</td>
      <td className="px-4 py-3 text-right">
        <Link href={row.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function CauseTreeCard({ tree }: { tree: CauseTree }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center ${M.iconSubtle}`}>
            <GitBranch size={18} className="text-[#1D6BFF]" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#1D6BFF]">{tree.category}</div>
            <h3 className="font-bold text-[#0F172A]">{tree.title}</h3>
          </div>
        </div>
        <SeverityBadge severity={tree.severity} />
      </div>
      <div className="mt-4 space-y-0">
        {tree.nodes.map((node, index) => (
          <div key={node.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full vyron-grad-surface text-[10px] font-bold text-white">
                {index + 1}
              </div>
              {index < tree.nodes.length - 1 ? <div className="my-1 w-px flex-1 bg-[#CBD5E1]" /> : null}
            </div>
            <div className={`pb-4 ${index === tree.nodes.length - 1 ? "pb-0" : ""}`}>
              <div className="font-bold text-[#0F172A]">{node.label}</div>
              {node.detail ? <p className="mt-0.5 text-sm font-medium text-[#64748B]">{node.detail}</p> : null}
            </div>
          </div>
        ))}
      </div>
      <Link href={tree.href} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
        Investigate <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: RootCauseCluster }) {
  return (
    <Link
      href={cluster.href}
      className={`${M.moduleDataSection} block p-5 transition hover:border-[#1D6BFF]/30 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-[#0F172A]">{cluster.label}</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-2xl font-black text-[#0F172A]">{cluster.problemCount}</span>
            <span className="text-sm font-medium text-[#64748B]">linked problems</span>
            {cluster.severity !== "None" ? <SeverityBadge severity={cluster.severity} /> : null}
          </div>
          <p className="mt-2 text-sm font-medium text-[#64748B]">Exposure: {cluster.exposureLabel}</p>
        </div>
        <ArrowRight size={18} className="shrink-0 text-[#94A3B8]" />
      </div>
    </Link>
  );
}

function EvidenceRow({ item }: { item: EvidenceItem }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#1D6BFF]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#1D6BFF]">
            {item.category}
          </span>
          <span className="font-bold text-[#0F172A]">{item.label}</span>
        </div>
        <p className="mt-1 text-sm font-medium text-[#334155]">{item.value}</p>
      </div>
      <Link href={item.href} className="shrink-0 text-xs font-bold text-[#1D6BFF]">
        View →
      </Link>
    </div>
  );
}

function CorrectiveActionCard({ action }: { action: CorrectiveAction }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full vyron-grad-surface text-[10px] font-bold text-white">
          {action.priority}
        </span>
        <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">Root cause</div>
      </div>
      <p className="mt-2 text-sm font-bold text-[#334155]">{action.rootCause}</p>
      <p className="mt-2 font-bold text-[#0F172A]">{action.action}</p>
      <p className="mt-2 text-xs font-semibold text-[#64748B]">Expected improvement: {action.expectedImprovement}</p>
      <Link href={action.href} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
        Open module <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function RecurringCauseRow({ cause }: { cause: RecurringCause }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{cause.cause}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{cause.frequency}</td>
      <td className="px-4 py-3">
        <SeverityBadge severity={cause.severity} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#64748B]">{cause.sources.join(" · ")}</td>
      <td className="px-4 py-3 text-right">
        <Link href={cause.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function SeverityBadge({ severity }: { severity: RootCauseInvestigation["severity"] }) {
  const classes: Record<RootCauseInvestigation["severity"], string> = {
    Critical: "border-rose-200 bg-rose-50 text-rose-800",
    High: "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
    Medium: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900",
    Low: "border-[#1D6BFF]/25 bg-[#1D6BFF]/10 text-[#1D6BFF]",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${classes[severity]}`}>
      {severity}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: RootCauseInvestigation["confidence"] }) {
  const classes = {
    High: "text-violet-700",
    Medium: "text-fuchsia-800",
    Low: "text-[#64748B]",
  };
  return <span className={`text-xs font-bold ${classes[confidence]}`}>{confidence}</span>;
}
