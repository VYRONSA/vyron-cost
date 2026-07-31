"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
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
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  computeBusinessHealthSnapshot,
  type BusinessHealthSnapshot,
  type ExecutiveHealthAction,
  type HealthCategoryCard,
  type HealthStatus,
  type RiskLevel,
  type TrendDirection,
} from "@/lib/vyron-business-health";
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

function scoreLabel(score: number | null) {
  if (score == null) return "Insufficient Data";
  return String(score);
}

export default function BusinessHealthCentreClient({
  intelligence,
  companyName,
}: {
  intelligence: TenantCostIntelligence | null;
  companyName: string;
}) {
  const [commandData, setCommandData] = useState<ExecutiveCommandCentrePayload | null>(null);
  const [xeroConnection, setXeroConnection] = useState<XeroConnectionState | null>(null);
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary | null>(null);
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
      fetch("/api/customer-invoices").then((r) => r.json()),
    ])
      .then(([commandRes, xeroRes, invoiceRes]) => {
        if (commandRes.ok && commandRes.data) {
          setCommandData(commandRes.data as ExecutiveCommandCentrePayload);
        }
        if (xeroRes.ok) {
          setXeroConnection(xeroRes.connection || null);
        }
        if (invoiceRes.ok && Array.isArray(invoiceRes.invoices)) {
          const posted = invoiceRes.invoices.filter(
            (inv: { status?: string; stock_posted?: boolean; invoice_date?: string; customer_id?: string | null }) => {
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
              return {
                sales: acc.sales + sales,
                gp: acc.gp + Number(inv.gross_profit || 0),
              };
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
      .catch(() => setLoadError("Could not load business health data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const snapshot: BusinessHealthSnapshot = useMemo(
    () =>
      computeBusinessHealthSnapshot({
        intelligence,
        commandData,
        xeroConnection,
        invoiceSummary,
      }),
    [intelligence, commandData, xeroConnection, invoiceSummary]
  );

  const hasAnyData =
    Boolean(intelligence?.products.length) ||
    Boolean(commandData) ||
    Boolean(invoiceSummary?.invoiceCount) ||
    Boolean(xeroConnection);

  return (
    <div className="space-y-6">
      <header className={M.moduleHeaderNavy}>
        <div className={`relative p-1 md:p-2 ${M.dashboardHeroInner}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#3B82F6]/35 bg-[#3B82F6]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#FECDD3]">
                Business Health Centre
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Business Health Centre</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                Overall business health for <span className="font-bold text-white">{companyName}</span> ·{" "}
                {currentPeriodLabel()} · How healthy is the business overall?
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Overall:{" "}
                  <span className="text-white">
                    {snapshot.overallScore != null ? `${snapshot.overallScore}/100` : "Insufficient Data"}
                  </span>
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Trend: <span className="text-white">{snapshot.trend}</span>
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Categories scored:{" "}
                  <span className="text-white">
                    {snapshot.scoredCategoryCount}/{snapshot.categories.length}
                  </span>
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

      {!hasAnyData && !loading ? (
        <section className={M.moduleDataSection}>
          <h2 className="text-xl font-bold text-[#0F172A]">Business health data not available yet</h2>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Load operational data so VYRON COST can score financial, cost, inventory, procurement, production and
            customer health from real records.
          </p>
          <ul className="mt-4 space-y-2 text-sm font-medium text-[#334155]">
            <li>· Create products with selling prices, costs and target GP</li>
            <li>· Build recipes / BOMs and capture ingredient costs</li>
            <li>· Import suppliers and process purchase orders / GRNs</li>
            <li>· Maintain inventory stock and movements</li>
            <li>· Post customer invoices and connect Xero</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/products" className={`${M.primaryBtn} px-4 py-2 text-sm`}>
              Products
            </Link>
            <Link href="/suppliers" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Suppliers
            </Link>
            <Link href="/purchase-orders" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Purchase Orders
            </Link>
            <Link href="/inventory/stock" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Inventory
            </Link>
            <Link href="/integrations/xero" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Connect Xero
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className={M.moduleDataSection}>
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <h2 className="text-xl font-bold text-[#0F172A]">Business health score</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Composite score from scored health categories — no fabricated numbers.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div
                  className="flex h-28 w-28 flex-col items-center justify-center rounded-full border-4 bg-[#F8FAFC]"
                  style={{
                    borderColor:
                      snapshot.overallScore == null
                        ? "#CBD5E1"
                        : snapshot.overallScore >= 80
                          ? "#8B5CF6"
                          : snapshot.overallScore >= 65
                            ? "#C026D3"
                            : snapshot.overallScore >= 45
                              ? "#A855F7"
                              : "#2563EB",
                  }}
                >
                  <div className="text-3xl font-black text-[#0F172A]">
                    {snapshot.overallScore != null ? snapshot.overallScore : "—"}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                    {snapshot.overallScore != null ? "/ 100" : "N/A"}
                  </div>
                </div>
                <div>
                  <StatusBadge status={snapshot.overallStatus} large />
                  <p className="mt-2 max-w-xs text-sm font-medium text-[#64748B]">
                    {snapshot.overallScore == null
                      ? "Insufficient data across health categories. Complete setup steps below to enable scoring."
                      : `${snapshot.scoredCategoryCount} of ${snapshot.categories.length} categories contributed to this score.`}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-[#0F172A]">Health category cards</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {snapshot.categories.map((category) => (
                <CategoryCard key={category.id} category={category} />
              ))}
            </div>
          </section>

          <section className={M.moduleDataSection}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#0F172A]">Trend direction</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Derived from recovery and spend trend series when available.
                </p>
              </div>
              <TrendBadge trend={snapshot.trend} />
            </div>
            {snapshot.trend === "Insufficient Data" ? (
              <p className="mt-3 text-sm font-medium text-[#64748B]">
                Trend requires operational time-series data from procurement and recovery activity.
              </p>
            ) : null}
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Business risk matrix</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Risks grouped by severity from live product, inventory, supplier, manufacturing and Xero signals.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              {(["Critical", "High", "Medium", "Low"] as RiskLevel[]).map((level) => (
                <RiskColumn key={level} level={level} items={snapshot.riskMatrix[level]} />
              ))}
            </div>
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Top executive risks</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">Highest-priority risks ranked by severity.</p>
            <div className={`mt-4 ${M.tableSurface}`}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className={VYRON_TABLE.head}>
                    <th className="px-4 py-3 text-left">Risk</th>
                    <th className="px-4 py-3 text-left">Severity</th>
                    <th className="px-4 py-3 text-left">Detail</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.topRisks.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                        No material risks detected on current data.
                      </td>
                    </tr>
                  ) : (
                    snapshot.topRisks.map((risk) => (
                      <tr key={risk.id} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                        <td className="px-4 py-3 font-semibold text-[#0F172A]">{risk.title}</td>
                        <td className="px-4 py-3">
                          <RiskLevelBadge level={risk.level} />
                        </td>
                        <td className="px-4 py-3 text-[#64748B]">{risk.detail}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={risk.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
                            Open <ArrowRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Executive action centre</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Recommended leadership actions linked to the modules that resolve each issue.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {snapshot.actions.map((action) => (
                <ActionCard key={action.id} action={action} />
              ))}
            </div>
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-lg font-bold text-[#0F172A]">Executive drilldowns</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { label: "Executive Boardroom", href: "/executive-boardroom", icon: Building2 },
                { label: "Cost Intelligence", href: "/cost-intelligence", icon: BarChart3 },
                { label: "Early Warning", href: "/early-warning", icon: Shield },
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

function CategoryCard({ category }: { category: HealthCategoryCard }) {
  const icons: Record<string, typeof Wallet> = {
    financial: Wallet,
    cost: TrendingDown,
    inventory: Package,
    procurement: ShoppingCart,
    production: Factory,
    customer: Users,
  };
  const Icon = icons[category.id] || Activity;

  return (
    <Link
      href={category.href}
      className={`${M.moduleDataSection} block p-5 transition hover:border-[#1D6BFF]/30 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center ${M.iconSubtle}`}>
              <Icon size={18} className="text-[#1D6BFF]" />
            </div>
            <h3 className="font-bold text-[#0F172A]">{category.label}</h3>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={category.status} />
            <span className="text-2xl font-black text-[#0F172A]">{scoreLabel(category.score)}</span>
            {category.score != null ? (
              <span className="text-xs font-bold text-[#64748B]">/ 100</span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-medium text-[#64748B]">{category.keyIssue}</p>
        </div>
        <ArrowRight size={18} className="shrink-0 text-[#94A3B8]" />
      </div>
    </Link>
  );
}

function ActionCard({ action }: { action: ExecutiveHealthAction }) {
  const severityClasses = {
    critical: "border-rose-200 bg-rose-50",
    warning: "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)]",
    info: "border-[#E2E8F0] bg-[#F8FAFC]",
  };
  return (
    <div className={`rounded-2xl border p-4 ${severityClasses[action.severity]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold text-[#0F172A]">{action.title}</div>
          <p className="mt-1 text-sm font-medium text-[#64748B]">{action.explanation}</p>
        </div>
        <ActionSeverityBadge severity={action.severity} />
      </div>
      <Link href={action.href} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
        Open module <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function RiskColumn({ level, items }: { level: RiskLevel; items: Array<{ id: string; title: string; detail: string; href: string }> }) {
  const colors: Record<RiskLevel, string> = {
    Critical: "border-rose-200 bg-rose-50",
    High: "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)]",
    Medium: "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)]",
    Low: "border-violet-200 bg-violet-50",
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[level]}`}>
      <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#64748B]">{level}</div>
      <div className="mt-1 text-2xl font-black text-[#0F172A]">{items.length}</div>
      <ul className="mt-3 space-y-2">
        {items.length === 0 ? (
          <li className="text-xs font-medium text-[#94A3B8]">No risks at this level.</li>
        ) : (
          items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="text-sm font-semibold text-[#334155] hover:text-[#1D6BFF]">
                {item.title}
              </Link>
              <p className="text-xs font-medium text-[#64748B]">{item.detail}</p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function StatusBadge({ status, large }: { status: HealthStatus; large?: boolean }) {
  const classes: Record<HealthStatus, string> = {
    Healthy: "border-violet-200 bg-violet-50 text-violet-800",
    Watch: "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
    Risk: "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
    Critical: "border-rose-200 bg-rose-50 text-rose-800",
    "Insufficient Data": "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 font-bold uppercase tracking-wide ${classes[status]} ${
        large ? "text-xs" : "text-[10px]"
      }`}
    >
      {status}
    </span>
  );
}

function RiskLevelBadge({ level }: { level: RiskLevel }) {
  const classes: Record<RiskLevel, string> = {
    Critical: "border-rose-200 bg-rose-50 text-rose-700",
    High: "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
    Medium: "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
    Low: "border-violet-200 bg-violet-50 text-violet-800",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${classes[level]}`}>
      {level}
    </span>
  );
}

function ActionSeverityBadge({ severity }: { severity: ExecutiveHealthAction["severity"] }) {
  const labels = { critical: "Critical", warning: "Warning", info: "Info" };
  const classes = {
    critical: "text-rose-700",
    warning: "text-[var(--vyron-warning-fg)]",
    info: "text-[#64748B]",
  };
  return <span className={`text-[10px] font-bold uppercase ${classes[severity]}`}>{labels[severity]}</span>;
}

function TrendBadge({ trend }: { trend: TrendDirection }) {
  const config: Record<TrendDirection, { className: string; icon: typeof TrendingUp }> = {
    Improving: { className: "border-violet-200 bg-violet-50 text-violet-800", icon: TrendingUp },
    Stable: { className: "border-[#1D6BFF]/25 bg-[#1D6BFF]/10 text-[#1D6BFF]", icon: Activity },
    Declining: { className: "border-rose-200 bg-rose-50 text-rose-800", icon: TrendingDown },
    "Insufficient Data": { className: "border-slate-200 bg-slate-50 text-slate-700", icon: AlertTriangle },
  };
  const { className, icon: Icon } = config[trend];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${className}`}>
      <Icon size={16} />
      {trend}
    </span>
  );
}
