"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  Factory,
  Package,
  RefreshCcw,
  ShoppingCart,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import type { ExecutiveCommandCentrePayload } from "@/lib/vyron-executive-command-centre";
import type { TenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import type { XeroConnectionState } from "@/lib/vyron-xero-integration";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";

const M = VYRON_MASTER;

function money(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function currentPeriodLabel() {
  return new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

type InvoiceSummary = {
  monthlySales: number;
  monthlyGpPct: number;
  invoiceCount: number;
};

type RecoveryPriority = {
  id: string;
  issue: string;
  affected: string;
  category: string;
  impact: number;
  confidence: string;
  action: string;
  href: string;
};

function recoveryHref(category: string, issue: string) {
  const lower = `${category} ${issue}`.toLowerCase();
  if (lower.includes("supplier") || lower.includes("inflation")) return "/document-intelligence/price-history/supplier";
  if (lower.includes("manufacturing") || lower.includes("variance")) return "/manufacturing/variances";
  if (lower.includes("inventory") || lower.includes("stock")) return "/inventory/alerts";
  if (lower.includes("customer") || lower.includes("invoice")) return "/customer-invoices";
  if (lower.includes("xero")) return "/integrations/xero";
  if (lower.includes("margin") || lower.includes("gp") || lower.includes("reprice")) return "/cost-intelligence";
  return "/recovery-opportunities";
}

function severityToConfidence(severity: string) {
  const s = severity.toLowerCase();
  if (s.includes("critical")) return "High";
  if (s.includes("high")) return "Medium-High";
  if (s.includes("watch") || s.includes("monitor")) return "Medium";
  return "Moderate";
}

export default function ExecutiveBoardroomClient({
  intelligence,
  companyName,
}: {
  intelligence: TenantCostIntelligence | null;
  companyName: string;
}) {
  const [commandData, setCommandData] = useState<ExecutiveCommandCentrePayload | null>(null);
  const [xeroConnection, setXeroConnection] = useState<XeroConnectionState | null>(null);
  const [xeroQueueReady, setXeroQueueReady] = useState(0);
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    setLoadError(null);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    Promise.all([
      fetch("/api/executive/command-centre").then((r) => r.json()),
      fetch("/api/integrations/xero/connection").then((r) => r.json()),
      fetch("/api/integrations/xero/sync-queue").then((r) => r.json()),
      fetch("/api/customer-invoices").then((r) => r.json()),
    ])
      .then(([commandRes, xeroRes, queueRes, invoiceRes]) => {
        if (commandRes.ok && commandRes.data) setCommandData(commandRes.data as ExecutiveCommandCentrePayload);
        if (xeroRes.ok) setXeroConnection(xeroRes.connection || null);
        if (queueRes.ok && Array.isArray(queueRes.items)) {
          setXeroQueueReady(queueRes.items.filter((i: { status: string }) => i.status === "Ready").length);
        }
        if (invoiceRes.ok && Array.isArray(invoiceRes.invoices)) {
          const posted = invoiceRes.invoices.filter(
            (inv: { status?: string; stock_posted?: boolean; invoice_date?: string }) => {
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
          setInvoiceSummary({
            monthlySales,
            monthlyGpPct: gpWeighted.sales > 0 ? (gpWeighted.gp / gpWeighted.sales) * 100 : 0,
            invoiceCount: posted.length,
          });
        }
        setLastRefresh(new Date().toISOString());
      })
      .catch(() => setLoadError("Some boardroom data could not be loaded."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const recoveryPriorities = useMemo<RecoveryPriority[]>(() => {
    const items: RecoveryPriority[] = [];

    for (const [index, item] of (intelligence?.recoveryOpportunities || []).entries()) {
      items.push({
        id: `intel-${index}`,
        issue: item.title,
        affected: item.category,
        category: item.category,
        impact: item.monthlyValue,
        confidence: severityToConfidence(item.severity),
        action: item.action,
        href: recoveryHref(item.category, item.title),
      });
    }

    for (const feed of commandData?.aiFeed || []) {
      if (items.length >= 12) break;
      if (items.some((row) => row.issue === feed.title)) continue;
      items.push({
        id: feed.id,
        issue: feed.title,
        affected: feed.category,
        category: feed.category,
        impact: 0,
        confidence: feed.severity === "high" ? "High" : feed.severity === "medium" ? "Medium" : "Moderate",
        action: feed.message,
        href: feed.href || recoveryHref(feed.category, feed.title),
      });
    }

    return items.sort((a, b) => b.impact - a.impact).slice(0, 10);
  }, [intelligence, commandData]);

  const boardSignals = useMemo(() => {
    const signals: Array<{
      id: string;
      label: string;
      severity: "critical" | "warning" | "info" | "ok";
      detail: string;
      href: string;
    }> = [];

    const erosion = intelligence?.summary.erosionCount ?? 0;
    if (erosion > 0) {
      signals.push({
        id: "margin-erosion",
        label: "Margin erosion",
        severity: erosion >= 5 ? "critical" : "warning",
        detail: `${erosion} product(s) below target GP — repricing or cost recovery needed.`,
        href: "/cost-intelligence",
      });
    }

    const inflation = intelligence?.summary.inflationSuppliers ?? commandData?.headline.supplierInflation ?? 0;
    if (Number(inflation) > 0) {
      signals.push({
        id: "supplier-inflation",
        label: "Supplier inflation",
        severity: Number(inflation) >= 8 ? "critical" : "warning",
        detail: `${intelligence?.summary.inflationSuppliers ?? "Multiple"} supplier(s) with price movement exposure.`,
        href: "/document-intelligence/price-history/supplier",
      });
    }

    const inv = commandData?.inventory;
    if (inv && (inv.lowStock > 0 || inv.overstock > 0 || inv.slowMoving > 0)) {
      signals.push({
        id: "stock-exposure",
        label: "Stock exposure",
        severity: inv.lowStock >= 5 || inv.negativeStockRisks > 0 ? "critical" : "warning",
        detail: `Low stock ${inv.lowStock} · Overstock ${inv.overstock} · Slow-moving ${inv.slowMoving}.`,
        href: "/inventory/alerts",
      });
    }

    const mfg = commandData?.manufacturing;
    if (mfg && mfg.wastagePct >= 5) {
      signals.push({
        id: "mfg-variance",
        label: "Manufacturing variance",
        severity: mfg.wastagePct >= 10 ? "critical" : "warning",
        detail: `Wastage ${pct(mfg.wastagePct)} · Yield ${pct(mfg.yieldPct)}.`,
        href: "/manufacturing/variances",
      });
    }

    if (erosion > 0 || (invoiceSummary && invoiceSummary.monthlyGpPct < 35)) {
      signals.push({
        id: "customer-profitability",
        label: "Customer profitability",
        severity: invoiceSummary && invoiceSummary.monthlyGpPct < 30 ? "critical" : "warning",
        detail: invoiceSummary
          ? `Month GP ${pct(invoiceSummary.monthlyGpPct)} across ${invoiceSummary.invoiceCount} invoice(s).`
          : "Product margin pressure may affect customer invoice profitability.",
        href: "/customer-invoices",
      });
    }

    const xeroConnected = xeroConnection?.connected;
    const xeroStatus = xeroConnection?.status || "Not Connected";
    signals.push({
      id: "xero-readiness",
      label: "Xero / accounting readiness",
      severity: !xeroConnected ? "warning" : xeroQueueReady > 0 ? "info" : "ok",
      detail: !xeroConnected
        ? `Xero ${xeroStatus} — connect before posting approved transactions.`
        : xeroQueueReady > 0
          ? `Connected · ${xeroQueueReady} item(s) ready to sync to Xero.`
          : "Connected · sync queue clear.",
      href: "/integrations/xero",
    });

    if (signals.length === 0) {
      signals.push({
        id: "no-signals",
        label: "Monitoring active",
        severity: "ok",
        detail: "No critical board signals detected. Continue monitoring procurement, stock and margin.",
        href: "/vyron-command-centre",
      });
    }

    return signals;
  }, [intelligence, commandData, invoiceSummary, xeroConnection, xeroQueueReady]);

  const criticalCount = boardSignals.filter((s) => s.severity === "critical").length;
  const aiStatus =
    criticalCount >= 3 ? "Critical attention required" : criticalCount > 0 ? "Active monitoring" : "Stable";

  const kpis = [
    {
      label: "Inventory value",
      value: money(commandData?.inventory.inventoryValue ?? 0),
      href: "/inventory/stock",
      icon: Package,
    },
    {
      label: "Supplier spend (month)",
      value: money(commandData?.procurement.spendThisMonth ?? 0),
      href: "/purchase-orders",
      icon: ShoppingCart,
    },
    {
      label: "Manufacturing output",
      value: money(commandData?.manufacturing.productionCost ?? 0),
      href: "/manufacturing",
      icon: Factory,
    },
    {
      label: "Sales / invoices (month)",
      value: money(invoiceSummary?.monthlySales ?? commandData?.headline.salesToday ?? 0),
      href: "/customer-invoices",
      icon: Wallet,
    },
    {
      label: "Gross profit %",
      value: pct(invoiceSummary?.monthlyGpPct ?? 0),
      href: "/reports/product-margins",
      icon: TrendingDown,
    },
    {
      label: "Recovery opportunity",
      value: money(commandData?.recovery.potentialRecovery ?? intelligence?.summary.recoveryMonthly ?? 0),
      href: "/recovery-opportunities",
      icon: Building2,
    },
  ];

  const hasData = Boolean(commandData || intelligence);

  return (
    <div className="space-y-6">
      <header className={M.moduleHeaderNavy}>
        <div className={`relative p-1 md:p-2 ${M.dashboardHeroInner}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#1D6BFF]/30 bg-[#1D6BFF]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#CBD5E1]">
                Executive Boardroom
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>{companyName}</h1>
              <p className={`mt-2 text-sm font-medium ${M.bodyOnDark}`}>
                Board-level cost, stock, procurement, manufacturing, margin and recovery position ·{" "}
                <span className="font-bold text-white">{currentPeriodLabel()}</span>
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  AI boardroom: <span className="text-white">{aiStatus}</span>
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Critical signals: <span className="text-white">{criticalCount}</span>
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
        <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm font-semibold text-fuchsia-900">
          {loadError}
        </div>
      ) : null}

      {!hasData && !loading ? (
        <section className={M.moduleDataSection}>
          <h2 className="text-xl font-bold text-[#0F172A]">Boardroom data not available yet</h2>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Connect products, suppliers, procurement, inventory and invoices so VYRON COST can build executive signals.
          </p>
          <ul className="mt-4 space-y-2 text-sm font-medium text-[#334155]">
            <li>· Create products, ingredients and suppliers</li>
            <li>· Process purchase orders, GRNs and customer invoices</li>
            <li>· Complete production runs and stock movements</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/products" className={`${M.primaryBtn} px-4 py-2 text-sm`}>
              Products
            </Link>
            <Link href="/suppliers" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Suppliers
            </Link>
            <Link href="/purchase-orders" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Procurement
            </Link>
            <Link href="/inventory/stock" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Inventory
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {kpis.map((kpi) => (
              <Link
                key={kpi.label}
                href={kpi.href}
                className={`${M.moduleDataSection} block p-5 transition hover:border-[#1D6BFF]/30 hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">{kpi.label}</div>
                    <div className="mt-2 text-2xl font-bold text-[#0F172A]">
                      {loading ? "…" : kpi.value}
                    </div>
                  </div>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center ${M.iconSubtle}`}>
                    <kpi.icon size={20} />
                  </div>
                </div>
              </Link>
            ))}
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Board signals</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Margin, supplier, stock, manufacturing, customer and accounting readiness alerts.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {boardSignals.map((signal) => (
                <Link
                  key={signal.id}
                  href={signal.href}
                  className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 transition hover:border-[#1D6BFF]/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#0F172A]">{signal.label}</span>
                    <SeverityBadge severity={signal.severity} />
                  </div>
                  <p className="mt-2 text-sm font-medium text-[#64748B]">{signal.detail}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className={M.moduleDataSection}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#0F172A]">Recovery priorities</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Ranked actions by estimated Rand impact and confidence.
                </p>
              </div>
              <Link href="/recovery-opportunities" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
                Recovery pipeline
              </Link>
            </div>

            <div className={`mt-4 ${M.tableSurface}`}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className={VYRON_TABLE.head}>
                    <th className="px-4 py-3 text-left">Issue</th>
                    <th className="px-4 py-3 text-left">Affected</th>
                    <th className="px-4 py-3 text-right">Est. impact</th>
                    <th className="px-4 py-3 text-left">Confidence</th>
                    <th className="px-4 py-3 text-left">Suggested action</th>
                    <th className="px-4 py-3 text-right">Drilldown</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                        Loading recovery priorities…
                      </td>
                    </tr>
                  ) : recoveryPriorities.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                        No recovery priorities yet. Add product costing and supplier data to generate board actions.
                      </td>
                    </tr>
                  ) : (
                    recoveryPriorities.map((row) => (
                      <tr key={row.id} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                        <td className="px-4 py-3 font-semibold text-[#0F172A]">{row.issue}</td>
                        <td className="px-4 py-3 text-[#64748B]">{row.affected}</td>
                        <td className="px-4 py-3 text-right font-bold text-[#2563EB]">
                          {row.impact > 0 ? `${money(row.impact)}/mo` : "—"}
                        </td>
                        <td className="px-4 py-3 text-[#334155]">{row.confidence}</td>
                        <td className="px-4 py-3 text-[#334155]">{row.action}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={row.href} className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
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

          {intelligence && intelligence.repricingSuggestions.length > 0 ? (
            <section className={M.moduleDataSection}>
              <h2 className="text-xl font-bold text-[#0F172A]">Repricing opportunities</h2>
              <p className="mt-1 text-sm font-medium text-[#64748B]">
                Products below target GP with suggested selling prices.
              </p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {intelligence.repricingSuggestions.slice(0, 6).map((item) => (
                  <div
                    key={item.productName}
                    className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4"
                  >
                    <div className="font-bold text-[#0F172A]">{item.productName}</div>
                    <p className="mt-1 text-sm text-[#64748B]">
                      {money(item.currentPrice)} → {money(item.suggestedPrice)} · Target GP {pct(item.targetGp)}
                    </p>
                    <p className="mt-2 text-sm font-bold text-[#1D6BFF]">
                      Recovery potential {money(item.monthlyRecovery)}/month
                    </p>
                    <Link href="/cost-intelligence" className="mt-2 inline-flex text-xs font-bold text-[#1D6BFF]">
                      Open Cost Intelligence →
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className={M.moduleDataSection}>
            <h2 className="text-lg font-bold text-[#0F172A]">Module drilldowns</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { label: "Business Health", href: "/business-health" },
                { label: "Early Warning", href: "/early-warning" },
                { label: "Predictive Risk", href: "/predictive-risk" },
                { label: "Root Cause", href: "/root-cause" },
                { label: "Decisions", href: "/decisions" },
                { label: "Actions", href: "/actions" },
                { label: "Autonomous Command", href: "/autonomous-command-centre" },
                { label: "Suppliers", href: "/suppliers" },
                { label: "Inventory", href: "/inventory/stock" },
                { label: "Manufacturing", href: "/manufacturing" },
                { label: "Customer invoices", href: "/customer-invoices" },
                { label: "Reports", href: "/reports" },
                { label: "Xero", href: "/integrations/xero" },
                { label: "Cost Intelligence", href: "/cost-intelligence" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-xl border border-[#E2E8F0] bg-[#F6F7FB] px-4 py-2 text-sm font-semibold text-[#334155] transition hover:border-[#1D6BFF]/30 hover:text-[#1D6BFF]"
                >
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

function SeverityBadge({ severity }: { severity: "critical" | "warning" | "info" | "ok" }) {
  const classes = {
    critical: "border-rose-200 bg-rose-50 text-rose-700",
    warning: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
    info: "border-[#1D6BFF]/25 bg-[#1D6BFF]/10 text-[#1D6BFF]",
    ok: "border-violet-200 bg-violet-50 text-violet-700",
  };
  const labels = {
    critical: "Critical",
    warning: "Warning",
    info: "Info",
    ok: "OK",
  };
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${classes[severity]}`}>
      {labels[severity]}
    </span>
  );
}
