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
  LineChart,
  Package,
  Play,
  RefreshCcw,
  Scale,
  Search,
  Shield,
  ShoppingCart,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import {
  computeActionsSnapshot,
  type ActionBlocker,
  type ActionsSnapshot,
  type ExecutionAction,
  type ExecutionPlaybook,
  type ExecutionQueueItem,
  type ExpectedOutcomeSummary,
  type OwnerGroup,
} from "@/lib/vyron-actions";
import type { ImpactEffortQuadrant } from "@/lib/vyron-decisions";
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

export default function ActionsCentreClient({
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
      .catch(() => setLoadError("Could not load action intelligence data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const snapshot: ActionsSnapshot = useMemo(
    () =>
      computeActionsSnapshot({
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

  const matrixQuadrants: ImpactEffortQuadrant[] = [
    "High Impact / Low Effort",
    "High Impact / High Effort",
    "Low Impact / Low Effort",
    "Low Impact / High Effort",
  ];

  return (
    <div className="space-y-6">
      <header className={M.moduleHeaderNavy}>
        <div className={`relative p-1 md:p-2 ${M.dashboardHeroInner}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#3B82F6]/35 bg-[#3B82F6]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#FECDD3]">
                Actions Centre
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Actions Centre</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                Convert executive decisions into actionable execution plans for{" "}
                <span className="font-bold text-white">{companyName}</span> · {currentPeriodLabel()}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Actions: <span className="text-white">{snapshot.pipeline.length}</span>
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Readiness: <span className="text-white">{snapshot.summary.executionReadiness}</span>
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

      {!snapshot.hasActionData && !loading ? (
        <section className={M.moduleDataSection}>
          <h2 className="text-xl font-bold text-[#0F172A]">Action intelligence requires additional operational data.</h2>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Actions are derived from Decisions, Root Causes, Early Warnings and Predictive Risk signals. Load operational
            data to enable traceable execution plans.
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
            <SummaryCard label="Critical Actions" value={String(snapshot.summary.criticalActions)} accent="#2563EB" />
            <SummaryCard label="High Priority Actions" value={String(snapshot.summary.highPriorityActions)} accent="#A855F7" />
            <SummaryCard
              label="Estimated Opportunity"
              value={
                snapshot.summary.estimatedOpportunity != null
                  ? snapshot.summary.opportunityLabel
                  : "Opportunity Not Yet Quantifiable"
              }
              accent="#1D6BFF"
              small={snapshot.summary.estimatedOpportunity == null}
            />
            <SummaryCard
              label="Estimated Risk Reduction"
              value={
                snapshot.summary.estimatedRiskReduction != null
                  ? snapshot.summary.riskReductionLabel
                  : "Opportunity Not Yet Quantifiable"
              }
              accent="#3B82F6"
              small={snapshot.summary.estimatedRiskReduction == null}
            />
            <SummaryCard label="Execution Readiness" value={snapshot.summary.executionReadiness} accent="#0F172A" />
          </section>

          {snapshot.pipeline.length === 0 ? (
            <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6">
              <div className="flex items-start gap-3">
                <CheckSquare size={22} className="mt-0.5 shrink-0 text-violet-700" />
                <div>
                  <h2 className="text-lg font-bold text-violet-950">No significant actions currently required.</h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-violet-900">
                    Current operational signals do not indicate material execution actions.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Action Pipeline</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Execution actions traceable to decisions, root causes, warnings and predictive risks.
                </p>
                <div className={`mt-4 ${M.tableSurface}`}>
                  <div className="overflow-x-auto">
                    <table className="min-w-[1400px] w-full text-sm">
                      <thead>
                        <tr className={VYRON_TABLE.head}>
                          <th className="px-4 py-3 text-left">Action</th>
                          <th className="px-4 py-3 text-left">Category</th>
                          <th className="px-4 py-3 text-left">Priority</th>
                          <th className="px-4 py-3 text-left">Owner</th>
                          <th className="px-4 py-3 text-left">Expected Outcome</th>
                          <th className="px-4 py-3 text-left">Estimated Impact</th>
                          <th className="px-4 py-3 text-left">Risk Reduction</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-left">Due Horizon</th>
                          <th className="px-4 py-3 text-right">Drilldown</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td colSpan={10} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                              Loading actions…
                            </td>
                          </tr>
                        ) : (
                          snapshot.pipeline.map((row) => <PipelineRow key={row.id} row={row} />)
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Execution Playbooks</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Execution plans generated only when supported by current tenant data.
                </p>
                {snapshot.playbooks.length === 0 ? (
                  <p className="mt-4 text-sm font-semibold text-[#64748B]">No execution playbooks on current signals.</p>
                ) : (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {snapshot.playbooks.map((playbook) => (
                      <PlaybookCard key={playbook.id} playbook={playbook} />
                    ))}
                  </div>
                )}
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Action Impact Matrix</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Actions positioned by impact and effort from operational intelligence.
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {matrixQuadrants.map((quadrant) => (
                    <ImpactMatrixQuadrant key={quadrant} quadrant={quadrant} actions={snapshot.impactMatrix[quadrant]} />
                  ))}
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Action Ownership Centre</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Actions grouped by owner with critical count, impact and readiness.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {snapshot.ownerGroups
                    .filter((group) => group.totalActions > 0)
                    .map((group) => (
                      <OwnerGroupCard key={group.id} group={group} />
                    ))}
                </div>
                {snapshot.ownerGroups.every((group) => group.totalActions === 0) ? (
                  <p className="mt-4 text-sm font-semibold text-[#64748B]">No owner assignments on current data.</p>
                ) : null}
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Blockers & Dependencies</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Data and integration gaps blocking execution readiness.
                </p>
                {snapshot.blockers.length === 0 ? (
                  <p className="mt-4 text-sm font-semibold text-violet-700">No blockers detected on current data.</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {snapshot.blockers.map((blocker) => (
                      <BlockerCard key={blocker.id} blocker={blocker} />
                    ))}
                  </div>
                )}
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Execution Queue</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Top 20 actions ranked Critical → High → Medium → Low.
                </p>
                <div className={`mt-4 ${M.tableSurface}`}>
                  <div className="overflow-x-auto">
                    <table className="min-w-[900px] w-full text-sm">
                      <thead>
                        <tr className={VYRON_TABLE.head}>
                          <th className="px-4 py-3 text-left">Rank</th>
                          <th className="px-4 py-3 text-left">Action</th>
                          <th className="px-4 py-3 text-left">Priority</th>
                          <th className="px-4 py-3 text-left">Owner</th>
                          <th className="px-4 py-3 text-left">Impact</th>
                          <th className="px-4 py-3 text-left">Confidence</th>
                          <th className="px-4 py-3 text-right">Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.executionQueue.map((item) => (
                          <QueueRow key={item.id} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Expected Outcomes</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Summarised outcomes from margin, supplier, inventory, data quality and financial visibility actions.
                </p>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {snapshot.expectedOutcomes.map((outcome) => (
                    <OutcomeCard key={outcome.id} outcome={outcome} />
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
                { label: "Predictive Risk", href: "/predictive-risk", icon: LineChart },
                { label: "Root Cause", href: "/root-cause", icon: Search },
                { label: "Decisions", href: "/decisions", icon: Gavel },
                { label: "Execution Centre", href: "/execution-centre", icon: Play },
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

function PipelineRow({ row }: { row: ExecutionAction }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{row.action}</td>
      <td className="px-4 py-3 font-semibold text-[#1D6BFF]">{row.category}</td>
      <td className="px-4 py-3">
        <PriorityBadge priority={row.priority} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.owner}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#64748B]">{row.expectedOutcome}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.estimatedImpact}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.riskReduction}</td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#64748B]">{row.dueHorizon}</td>
      <td className="px-4 py-3 text-right">
        <Link href={row.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function PlaybookCard({ playbook }: { playbook: ExecutionPlaybook }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#1D6BFF]">{playbook.category}</div>
      <h3 className="mt-1 font-bold text-[#0F172A]">{playbook.title}</h3>
      <div className="mt-4 space-y-2 text-sm">
        <p>
          <span className="font-bold text-[#0F172A]">Action: </span>
          {playbook.action}
        </p>
        <p>
          <span className="font-bold text-[#0F172A]">Owner: </span>
          {playbook.owner}
        </p>
        <p>
          <span className="font-bold text-[#0F172A]">Outcome: </span>
          {playbook.outcome}
        </p>
      </div>
      <Link href={playbook.href} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
        Execute <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function ImpactMatrixQuadrant({
  quadrant,
  actions,
}: {
  quadrant: ImpactEffortQuadrant;
  actions: ExecutionAction[];
}) {
  const accent =
    quadrant === "High Impact / Low Effort"
      ? "border-violet-200 bg-violet-50"
      : quadrant === "High Impact / High Effort"
        ? "border-fuchsia-200 bg-fuchsia-50"
        : quadrant === "Low Impact / Low Effort"
          ? "border-[#E2E8F0] bg-[#F8FAFC]"
          : "border-rose-100 bg-rose-50";

  return (
    <div className={`rounded-2xl border p-4 ${accent}`}>
      <div className="flex items-center gap-2">
        <Scale size={16} className="text-[#1D6BFF]" />
        <h3 className="font-bold text-[#0F172A]">{quadrant}</h3>
      </div>
      {actions.length === 0 ? (
        <p className="mt-3 text-sm font-medium text-[#64748B]">No actions in this quadrant.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {actions.map((row) => (
            <li key={row.id}>
              <Link href={row.href} className="text-sm font-semibold text-[#334155] hover:text-[#1D6BFF]">
                {row.action}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OwnerGroupCard({ group }: { group: OwnerGroup }) {
  return (
    <Link
      href={group.href}
      className={`${M.moduleDataSection} block p-5 transition hover:border-[#1D6BFF]/30 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-[#0F172A]">{group.owner}</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-2xl font-black text-[#0F172A]">{group.totalActions}</span>
            <span className="text-sm font-medium text-[#64748B]">actions</span>
            {group.criticalActions > 0 ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-800">
                {group.criticalActions} critical
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-medium text-[#64748B]">Impact: {group.impactLabel}</p>
          <p className="mt-1 text-sm font-medium text-[#64748B]">Readiness: {group.readiness}</p>
        </div>
        <ArrowRight size={18} className="shrink-0 text-[#94A3B8]" />
      </div>
    </Link>
  );
}

function BlockerCard({ blocker }: { blocker: ActionBlocker }) {
  return (
    <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={blocker.severity} />
        <h3 className="font-bold text-[#0F172A]">{blocker.blocker}</h3>
      </div>
      <p className="mt-2 text-sm font-medium text-[#64748B]">
        <span className="font-bold text-[#334155]">Resolution: </span>
        {blocker.resolutionPath}
      </p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Affected actions</p>
      <ul className="mt-1 space-y-1">
        {blocker.affectedActions.map((action) => (
          <li key={action} className="text-sm font-medium text-[#334155]">
            · {action}
          </li>
        ))}
      </ul>
      <Link href={blocker.href} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
        Resolve <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function QueueRow({ item }: { item: ExecutionQueueItem }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full vyron-grad-surface text-[10px] font-bold text-white">
          {item.rank}
        </span>
      </td>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{item.action}</td>
      <td className="px-4 py-3">
        <PriorityBadge priority={item.priority} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{item.owner}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{item.impact}</td>
      <td className="px-4 py-3">
        <ConfidenceBadge confidence={item.confidence} />
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={item.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function OutcomeCard({ outcome }: { outcome: ExpectedOutcomeSummary }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
      <h3 className="font-bold text-[#0F172A]">{outcome.label}</h3>
      <p className="mt-2 text-sm font-medium text-[#334155]">{outcome.value}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: ExecutionAction["priority"] }) {
  const classes: Record<ExecutionAction["priority"], string> = {
    Critical: "border-rose-200 bg-rose-50 text-rose-800",
    High: "border-orange-200 bg-orange-50 text-orange-900",
    Medium: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900",
    Low: "border-[#1D6BFF]/25 bg-[#1D6BFF]/10 text-[#1D6BFF]",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${classes[priority]}`}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: ExecutionAction["status"] }) {
  const classes: Record<ExecutionAction["status"], string> = {
    Ready: "border-violet-200 bg-violet-50 text-violet-800",
    Recommended: "border-[#1D6BFF]/25 bg-[#1D6BFF]/10 text-[#1D6BFF]",
    Waiting: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900",
    Blocked: "border-rose-200 bg-rose-50 text-rose-800",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${classes[status]}`}>
      {status}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: ExecutionAction["confidence"] }) {
  const classes = {
    High: "text-violet-700",
    Medium: "text-fuchsia-800",
    Low: "text-[#64748B]",
  };
  return <span className={`text-xs font-bold ${classes[confidence]}`}>{confidence}</span>;
}
