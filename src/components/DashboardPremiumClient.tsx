"use client";

import {
  BarChart3,
  BrainCircuit,
  Package,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
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

function DashboardHero({ tradingName }: { tradingName: string }) {
  return (
    <section className={M.dashboardHero}>
      <div className="pointer-events-none absolute -right-8 top-8 h-40 w-40 rounded-full bg-[#7C3AED]/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-6 left-1/4 h-32 w-32 rounded-full bg-[#F43F5E]/8 blur-2xl" />

      <div className="relative p-6 md:p-8">
        <div className={`p-5 md:p-6 ${M.dashboardHeroInner}`}>
          <div className="flex min-w-0 max-w-3xl flex-col justify-center">
            <div className={`inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#CBD5E1]`}>
              <Sparkles size={13} className="text-[#F43F5E]" />
              <span>
                VYRON COST <span className="text-[#9333EA]">Command Centre</span>
              </span>
            </div>

            <div className={`mt-4 text-[11px] font-bold uppercase tracking-[0.2em] ${M.mutedOnDark}`}>{tradingName}</div>

            <h1 className={`mt-2 break-words text-3xl leading-[1.12] tracking-[-0.03em] text-balance md:text-4xl ${M.headingOnDark}`}>
              AI Cost Intelligence{" "}
              <span className={M.gradientText}>Command Centre</span>
            </h1>

            <p className={`mt-4 max-w-lg text-sm font-medium leading-6 ${M.bodyOnDark}`}>
              Real-time recovery, supplier risk, inventory exposure and margin protection.
            </p>

            <div className="mt-5 grid max-w-xl gap-3">
              <div className={`flex min-w-0 items-center justify-between gap-2 overflow-hidden ${M.dashboardHeroRow}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#7C3AED]" />
                  <span className={`min-w-0 break-words text-xs font-bold uppercase tracking-[0.1em] ${M.bodyOnDark}`}>
                    Inventory Exposure
                  </span>
                </div>
                <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-[#9333EA]">Monitoring</span>
              </div>
              <div className={`flex min-w-0 items-center justify-between gap-2 overflow-hidden ${M.dashboardHeroRow}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#F43F5E]" />
                  <span className={`min-w-0 break-words text-xs font-bold uppercase tracking-[0.1em] ${M.bodyOnDark}`}>
                    Revenue Intelligence
                  </span>
                </div>
                <span className={`shrink-0 text-xs font-bold uppercase tracking-wide ${M.mutedOnDark}`}>Live</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function DashboardPremiumClient({
  mode,
  tradingName,
  client,
  stats,
  widgets,
  risks,
  topRecovery,
}: {
  mode: "demo" | "onboarding";
  tradingName: string;
  client?: ActiveClient | null;
  stats?: WorkspaceDashboardStats;
  widgets?: DemoWidgets;
  risks?: unknown[];
  topRecovery?: DemoRecovery;
}) {
  const quotes = VYRON_DOMAIN_QUOTES.executive;
  const counts = stats || {
    suppliers: 0,
    ingredients: 0,
    products: 0,
    inventoryValue: 0,
    customerInvoices: 0,
    xeroStatus: "Not Connected",
  };

  return (
    <VyronPageFrame>
      <DashboardHero tradingName={tradingName} />

      <section>
        <VyronSectionHeader title="Executive KPI Overview" />
        <VyronMetricGrid>
          <VyronMetricCard label="Inventory Value" value={counts.inventoryValue > 0 ? formatCurrency(counts.inventoryValue) : "Monitoring"} note="Awaiting transactions" href="/inventory" tone={counts.inventoryValue > 0 ? "healthy" : "default"} icon={<Warehouse size={18} />} />
          <VyronMetricCard label="Potential Recovery" value={topRecovery ? `R${topRecovery.monthlyRecovery.toLocaleString("en-ZA")}` : "No Recovery Yet"} note="Scanning pipeline" href="/financial-leakage" tone="warning" icon={<ShieldCheck size={18} />} />
          <VyronMetricCard label="Average GP" value="Monitoring" note="Calibrating signals" href="/product-profitability" tone="healthy" icon={<TrendingUp size={18} />} />
          <VyronMetricCard label="Supplier Risk" value={(risks?.length ?? 0) > 0 ? `${risks?.length ?? 0} Alerts` : "No Risk"} note="Monitoring" href="/supplier-intelligence" tone={(risks?.length ?? 0) > 0 ? "danger" : "healthy"} icon={<TriangleAlert size={18} />} />
          <VyronMetricCard label="Active Products" value={counts.products > 0 ? String(counts.products) : "Awaiting Txns"} note="Monitoring" href="/products" tone={counts.products > 0 ? "healthy" : "default"} icon={<Package size={18} />} />
          <VyronMetricCard label="Revenue" value={counts.customerInvoices > 0 ? String(counts.customerInvoices) : "Awaiting Txns"} note="Invoice feed" href="/customer-invoices" tone={counts.customerInvoices > 0 ? "healthy" : "default"} icon={<BarChart3 size={18} />} />
        </VyronMetricGrid>
      </section>

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
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#7C3AED]" />
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
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#7C3AED]" />
                  {label}
                </div>
                <div className="rounded-full border border-[#E2E8F0] bg-[#F6F7FB] px-2.5 py-0.5 text-[10px] font-bold text-[#334155]">
                  <span className="text-[#E11D48]">{confidence}</span> confidence
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
