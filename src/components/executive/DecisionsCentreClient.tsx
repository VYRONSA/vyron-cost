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
  computeDecisionsSnapshot,
  type DecisionConflict,
  type DecisionPlaybook,
  type DecisionQueueItem,
  type DecisionsSnapshot,
  type ExecutiveDecision,
  type ImpactEffortQuadrant,
  type OpportunityItem,
} from "@/lib/vyron-decisions";
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

export default function DecisionsCentreClient({
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
      .catch(() => setLoadError("Could not load decision intelligence data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const snapshot: DecisionsSnapshot = useMemo(
    () =>
      computeDecisionsSnapshot({
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
                Decisions Centre
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Decisions Centre</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                Convert intelligence into executive decisions — what management should decide today for{" "}
                <span className="font-bold text-white">{companyName}</span> · {currentPeriodLabel()}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Decisions: <span className="text-white">{snapshot.recommendedDecisions.length}</span>
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

      {!snapshot.hasDecisionData && !loading ? (
        <section className={M.moduleDataSection}>
          <h2 className="text-xl font-bold text-[#0F172A]">Decision intelligence requires additional operational data.</h2>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Decisions are derived from Early Warning, Predictive Risk, Root Cause and Business Health signals. Load
            operational data to enable traceable executive recommendations.
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
            <SummaryCard label="Critical Decisions" value={String(snapshot.summary.criticalDecisions)} accent="#2563EB" />
            <SummaryCard label="High Impact Decisions" value={String(snapshot.summary.highImpactDecisions)} accent="#A855F7" />
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
            <SummaryCard label="Confidence Level" value={snapshot.summary.confidenceLevel} accent="#0F172A" />
          </section>

          {snapshot.recommendedDecisions.length === 0 ? (
            <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6">
              <div className="flex items-start gap-3">
                <Gavel size={22} className="mt-0.5 shrink-0 text-violet-700" />
                <div>
                  <h2 className="text-lg font-bold text-violet-950">No significant executive decisions currently required.</h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-violet-900">
                    Current operational signals do not indicate material decisions requiring executive action.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Recommended Decisions</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Traceable decisions from current risks, root causes and opportunities — not generic advice.
                </p>
                <div className={`mt-4 ${M.tableSurface}`}>
                  <div className="overflow-x-auto">
                    <table className="min-w-[1300px] w-full text-sm">
                      <thead>
                        <tr className={VYRON_TABLE.head}>
                          <th className="px-4 py-3 text-left">Decision</th>
                          <th className="px-4 py-3 text-left">Category</th>
                          <th className="px-4 py-3 text-left">Why Recommended</th>
                          <th className="px-4 py-3 text-left">Expected Impact</th>
                          <th className="px-4 py-3 text-left">Urgency</th>
                          <th className="px-4 py-3 text-left">Confidence</th>
                          <th className="px-4 py-3 text-left">Risk Reduction</th>
                          <th className="px-4 py-3 text-left">Opportunity</th>
                          <th className="px-4 py-3 text-right">Drilldown</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td colSpan={9} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                              Loading decisions…
                            </td>
                          </tr>
                        ) : (
                          snapshot.recommendedDecisions.map((row) => <DecisionRow key={row.id} row={row} />)
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Decision Playbooks</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Executive decision cards generated only when supported by current tenant data.
                </p>
                {snapshot.playbooks.length === 0 ? (
                  <p className="mt-4 text-sm font-semibold text-[#64748B]">No playbooks triggered on current signals.</p>
                ) : (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {snapshot.playbooks.map((playbook) => (
                      <PlaybookCard key={playbook.id} playbook={playbook} />
                    ))}
                  </div>
                )}
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Decision Impact Matrix</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Decisions positioned by impact and effort from current signals.
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {matrixQuadrants.map((quadrant) => (
                    <ImpactMatrixQuadrant
                      key={quadrant}
                      quadrant={quadrant}
                      decisions={snapshot.impactMatrix[quadrant]}
                    />
                  ))}
                </div>
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Opportunity Centre</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Measurable opportunities from margin, supplier, inventory, manufacturing and integration signals.
                </p>
                {snapshot.opportunities.length === 0 ? (
                  <p className="mt-4 text-sm font-semibold text-[#64748B]">No quantifiable opportunities on current data.</p>
                ) : (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {snapshot.opportunities.map((item) => (
                      <OpportunityCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Decision Conflicts</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Competing decisions identified only when supported by simultaneous signals.
                </p>
                {snapshot.conflicts.length === 0 ? (
                  <p className="mt-4 text-sm font-semibold text-violet-700">No decision conflicts detected on current signals.</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {snapshot.conflicts.map((conflict) => (
                      <ConflictCard key={conflict.id} conflict={conflict} />
                    ))}
                  </div>
                )}
              </section>

              <section className={M.moduleDataSection}>
                <h2 className="text-xl font-bold text-[#0F172A]">Executive Decision Queue</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Top 10 ranked decisions by urgency, impact and opportunity.
                </p>
                <div className={`mt-4 ${M.tableSurface}`}>
                  <div className="overflow-x-auto">
                    <table className="min-w-[900px] w-full text-sm">
                      <thead>
                        <tr className={VYRON_TABLE.head}>
                          <th className="px-4 py-3 text-left">Priority</th>
                          <th className="px-4 py-3 text-left">Decision</th>
                          <th className="px-4 py-3 text-left">Category</th>
                          <th className="px-4 py-3 text-left">Impact</th>
                          <th className="px-4 py-3 text-left">Confidence</th>
                          <th className="px-4 py-3 text-left">Suggested Owner</th>
                          <th className="px-4 py-3 text-right">Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.decisionQueue.map((item) => (
                          <QueueRow key={item.id} item={item} />
                        ))}
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
                { label: "Early Warning", href: "/early-warning", icon: Shield },
                { label: "Predictive Risk", href: "/predictive-risk", icon: LineChart },
                { label: "Root Cause", href: "/root-cause", icon: Search },
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

function DecisionRow({ row }: { row: ExecutiveDecision }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{row.decision}</td>
      <td className="px-4 py-3 font-semibold text-[#1D6BFF]">{row.category}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#64748B]">{row.whyRecommended}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.expectedImpact}</td>
      <td className="px-4 py-3">
        <UrgencyBadge urgency={row.urgency} />
      </td>
      <td className="px-4 py-3">
        <ConfidenceBadge confidence={row.confidence} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.riskReduction}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.opportunity}</td>
      <td className="px-4 py-3 text-right">
        <Link href={row.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function PlaybookCard({ playbook }: { playbook: DecisionPlaybook }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#1D6BFF]">{playbook.category}</div>
          <h3 className="mt-1 font-bold text-[#0F172A]">{playbook.title}</h3>
        </div>
        <ConfidenceBadge confidence={playbook.confidence} />
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <p>
          <span className="font-bold text-[#0F172A]">Decision: </span>
          <span className="font-medium text-[#334155]">{playbook.decision}</span>
        </p>
        <p>
          <span className="font-bold text-[#0F172A]">Reason: </span>
          <span className="font-medium text-[#64748B]">{playbook.reason}</span>
        </p>
        <p>
          <span className="font-bold text-[#0F172A]">Expected result: </span>
          <span className="font-medium text-[#334155]">{playbook.expectedResult}</span>
        </p>
      </div>
      <Link href={playbook.href} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
        Open module <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function ImpactMatrixQuadrant({
  quadrant,
  decisions,
}: {
  quadrant: ImpactEffortQuadrant;
  decisions: ExecutiveDecision[];
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
      {decisions.length === 0 ? (
        <p className="mt-3 text-sm font-medium text-[#64748B]">No decisions in this quadrant.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {decisions.map((row) => (
            <li key={row.id}>
              <Link href={row.href} className="text-sm font-semibold text-[#334155] hover:text-[#1D6BFF]">
                {row.decision}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OpportunityCard({ item }: { item: OpportunityItem }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-[#0F172A]">{item.opportunity}</h3>
        <ConfidenceBadge confidence={item.confidence} />
      </div>
      <p className="mt-2 text-sm font-medium text-[#334155]">{item.estimatedImpact}</p>
      <p className="mt-2 text-xs font-semibold text-[#64748B]">{item.recommendedAction}</p>
      <Link href={item.href} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
        Open <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function ConflictCard({ conflict }: { conflict: DecisionConflict }) {
  return (
    <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4">
      <h3 className="font-bold text-[#0F172A]">{conflict.title}</h3>
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <p>
          <span className="font-bold text-[#334155]">A: </span>
          {conflict.decisionA}
        </p>
        <p>
          <span className="font-bold text-[#334155]">B: </span>
          {conflict.decisionB}
        </p>
      </div>
      <p className="mt-2 text-sm font-medium text-[#64748B]">{conflict.tension}</p>
      <ul className="mt-2 space-y-1">
        {conflict.sourceSignals.map((signal) => (
          <li key={signal} className="text-xs font-medium text-[#94A3B8]">
            · {signal}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QueueRow({ item }: { item: DecisionQueueItem }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full vyron-grad-surface text-[10px] font-bold text-white">
          {item.priority}
        </span>
      </td>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{item.decision}</td>
      <td className="px-4 py-3 font-semibold text-[#1D6BFF]">{item.category}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{item.impact}</td>
      <td className="px-4 py-3">
        <ConfidenceBadge confidence={item.confidence} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{item.suggestedOwner}</td>
      <td className="px-4 py-3 text-right">
        <Link href={item.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          Open <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function UrgencyBadge({ urgency }: { urgency: ExecutiveDecision["urgency"] }) {
  const classes: Record<ExecutiveDecision["urgency"], string> = {
    Immediate: "border-rose-200 bg-rose-50 text-rose-800",
    High: "border-orange-200 bg-orange-50 text-orange-900",
    Medium: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900",
    Low: "border-[#1D6BFF]/25 bg-[#1D6BFF]/10 text-[#1D6BFF]",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${classes[urgency]}`}>
      {urgency}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: ExecutiveDecision["confidence"] }) {
  const classes = {
    High: "text-violet-700",
    Medium: "text-fuchsia-800",
    Low: "text-[#64748B]",
  };
  return <span className={`text-xs font-bold ${classes[confidence]}`}>{confidence}</span>;
}
