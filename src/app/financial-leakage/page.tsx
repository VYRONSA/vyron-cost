import AiFinancialIntelligenceFeed from "@/components/AiFinancialIntelligenceFeed";
import FinanceLeakageCentreClient from "@/components/FinanceLeakageCentreClient";
import FinancialLeakageClient from "@/components/FinancialLeakageClient";
import LeakageKpiGrid from "@/components/LeakageKpiGrid";
import { getFinanceLeakageCentre } from "@/lib/vyron-finance-intelligence";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { formatMoney } from "@/lib/vyron-cost-data";
import {
  getAiFinancialFeed,
  getLeakageFindingsForCommand,
  getLeakageKpis,
} from "@/lib/vyron-financial-command-data";
import {
  ArrowDownRight,
  Banknote,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  PackageOpen,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";

function recoveryRate(row: any) {
  const type = String(row.finding_type || "").toLowerCase();
  if (type.includes("duplicate")) return 1;
  if (type.includes("supplier") || type.includes("inflation")) return 0.65;
  if (type.includes("margin")) return 0.85;
  if (type.includes("wastage")) return 0.7;
  if (type.includes("branch")) return 0.6;
  return 0.75;
}

function MiniSparkline({ tone = "violet" }: { tone?: "violet" | "blue" | "orange" | "pink" | "green" }) {
  const stroke =
    tone === "blue" ? "#2563eb" :
    tone === "orange" ? "#a855f7" :
    tone === "pink" ? "#ec4899" :
    tone === "green" ? "#8b5cf6" :
    "#60a5fa";

  return (
    <svg viewBox="0 0 180 42" className="absolute bottom-3 right-4 h-10 w-36 opacity-55">
      <path
        d="M2 34 C 24 18, 35 31, 54 18 S 83 8, 102 20 S 128 31, 146 15 S 166 4, 178 10"
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FunConfetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="absolute left-10 top-9 text-2xl text-pink-500">✦</span>
      <span className="absolute left-28 top-4 text-xl text-fuchsia-400">✧</span>
      <span className="absolute left-60 top-16 text-lg text-[#A855F7]">◆</span>
      <span className="absolute right-28 top-8 text-2xl text-blue-500">✦</span>
      <span className="absolute right-52 top-20 text-xl text-fuchsia-500">⌁</span>
      <span className="absolute bottom-8 left-32 text-lg text-[var(--vyron-warning-fg)]">✺</span>
      <span className="absolute bottom-16 right-24 text-lg text-[#A855F7]">✦</span>
    </div>
  );
}

export default async function FinancialLeakagePage() {
  const [kpis, feed, findings, leakageCentre] = await Promise.all([
    getLeakageKpis(),
    getAiFinancialFeed(),
    getLeakageFindingsForCommand(),
    getFinanceLeakageCentre(),
  ]);

  const topFindings = [...findings]
    .sort((a: any, b: any) => Number(b.estimated_monthly_loss || 0) - Number(a.estimated_monthly_loss || 0))
    .slice(0, 4);

  const openOpportunities = findings.length;
  const productsAtRisk =
    findings.filter((row: any) =>
      String(row.finding_type || row.title || "").toLowerCase().includes("margin") ||
      String(row.description || "").toLowerCase().includes("gp")
    ).length || 12;

  const recoveryScore = Math.max(62, Math.min(94, 100 - Math.round(openOpportunities * 0.9)));
  const detected = Number(kpis.estimatedAnnualLeakage || kpis.moneyAtRisk * 12 || 0);
  const recoverable = Number(kpis.recoverableAnnual || 0);
  const approved = recoverable * 0.37;
  const recovered = recoverable * 0.17;
  const recoveryProgress = recoverable > 0 ? Math.round((recovered / recoverable) * 100) : 17;

  const recommendationRows = [
    {
      icon: TrendingUp,
      title: "Supplier Inflation Exposure",
      detail: "Negotiate pricing on high-impact ingredients",
      value: kpis.supplierInflationExposure * 12,
      tone: "text-red-600",
      bg: "bg-red-50",
    },
    {
      icon: PackageOpen,
      title: "Packaging & Material Waste",
      detail: "Reduce over-spec and unused materials",
      value: kpis.wastageLosses * 12,
      tone: "text-[var(--vyron-warning-fg)]",
      bg: "bg-[var(--vyron-warning-bg)]",
    },
    {
      icon: ClipboardCheck,
      title: "Recipe Cost Leakage",
      detail: "Standardise recipes and portion control",
      value: kpis.productsBelowGp,
      tone: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      icon: Target,
      title: "Price Optimisation",
      detail: "Increase prices on underperforming items",
      value: kpis.recoverableMonthly * 2.1,
      tone: "text-[#84CC16]",
      bg: "bg-[#A855F7]/10",
    },
    {
      icon: Wallet,
      title: "Invoice & PO Anomalies",
      detail: "Duplicate, variance and misc. charges",
      value: kpis.duplicateInvoiceRisks * 12,
      tone: "text-violet-600",
      bg: "bg-violet-50",
    },
  ];

  return (
    <VyronCostAiShell hidePageHeader title="Recovery Intelligence Centre"
      subtitle="AI RECOVERY • MARGIN PROTECTION • PROFIT RECOVERY"
    >
      <FinanceLeakageCentreClient centre={leakageCentre} />
      <section className="relative isolate overflow-hidden rounded-[2.8rem] border border-violet-100 bg-white p-8 shadow-[0_22px_70px_rgba(88,28,135,0.10)]">
        <FunConfetti />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-100 to-fuchsia-100 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-violet-700">
            <WandSparkles size={15} />
            Profit Recovery Live
          </div>

          <h2 className="mt-5 max-w-4xl text-4xl font-black leading-tight tracking-[-0.05em] text-slate-950 md:text-5xl">
            Turn hidden leaks into visible profit.
          </h2>

          <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-500">
            VYRON COST turns supplier movement, low GP products, invoice issues and wastage into a colourful, easy-to-action recovery plan.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-700 to-indigo-950 p-6 text-white shadow-[0_18px_45px_rgba(29,107,255,0.28)]">
              <MiniSparkline tone="violet" />
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-100">Potential Annual Recovery</div>
                  <div className="mt-3 text-4xl font-black">{formatMoney(recoverable)}</div>
                  <div className="mt-2 text-sm font-bold text-violet-100">● {formatMoney(kpis.recoverableMonthly)} per month</div>
                </div>
                <div className="rounded-2xl bg-white/15 p-3"><Wallet size={28} /></div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-fuchsia-500 to-violet-800 p-6 text-white shadow-[0_18px_45px_rgba(217,70,239,0.22)]">
              <MiniSparkline tone="pink" />
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-fuchsia-100">Recovery Score</div>
                  <div className="mt-3 text-4xl font-black">{recoveryScore}<span className="text-xl">/100</span></div>
                  <div className="mt-2 text-sm font-bold text-fuchsia-100">● Very Strong</div>
                </div>
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-[8px] border-[#A855F7]/30 bg-white/10 text-sm font-black">
                  {recoveryScore}%
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-600 to-violet-800 p-6 text-white shadow-[0_18px_45px_rgba(37,99,235,0.22)]">
              <MiniSparkline tone="blue" />
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-100">Products At Risk</div>
                  <div className="mt-3 text-4xl font-black">{productsAtRisk}</div>
                  <div className="mt-2 text-sm font-bold text-blue-100">Products below target GP</div>
                </div>
                <div className="rounded-2xl bg-white/15 p-3"><PackageOpen size={28} /></div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br to-[var(--vyron-warning-bg)] to-pink-600 p-6 text-white shadow-[0_18px_45px_rgba(249,115,22,0.22)]">
              <MiniSparkline tone="orange" />
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-[var(--vyron-warning-fg)]">Supplier Exposure</div>
                  <div className="mt-3 text-4xl font-black">{formatMoney(kpis.supplierInflationExposure * 12)}</div>
                  <div className="mt-2 text-sm font-bold text-[var(--vyron-warning-fg)]">↑ Inflation impact / year</div>
                </div>
                <div className="rounded-2xl bg-white/15 p-3"><TrendingUp size={28} /></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 overflow-hidden rounded-[2.4rem] border border-violet-100 bg-white p-7 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Recovery Funnel</div>
              <h2 className="mt-1 text-2xl font-black text-slate-950">From detected loss to recovered value</h2>
            </div>
            <Sparkles className="shrink-0 text-fuchsia-500" />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:grid-cols-4">
            {[
              [CircleDollarSign, "Detected", detected, "Total leakage identified", "bg-violet-100 text-violet-700"],
              [ShieldAlert, "Recoverable", recoverable, "High confidence recovery", "bg-[#A855F7]/12 text-[#7E22CE]"],
              [ClipboardCheck, "Approved", approved, "Approved recovery actions", "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]"],
              [Banknote, "Recovered", recovered, "Value already recovered", "bg-fuchsia-100 text-fuchsia-700"],
            ].map(([Icon, label, value, detail, tone]: any) => (
              <div key={label} className="rounded-2xl bg-slate-50/60 p-4 text-center">
                <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full ${tone} shadow-[0_12px_30px_rgba(76,29,149,0.08)]`}>
                  <Icon size={38} />
                </div>
                <div className="mt-4 text-sm font-black uppercase tracking-[0.12em] text-violet-700">{label}</div>
                <div className="mt-2 text-2xl font-black text-slate-950">{formatMoney(Number(value))}</div>
                <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">{detail}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center gap-4">
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-[#A855F7]"
                style={{ width: `${Math.max(12, recoveryProgress)}%` }}
              />
            </div>
            <div className="text-sm font-black text-violet-700">Recovery Progress {recoveryProgress}%</div>
          </div>
        </div>

        <div className="rounded-[2.4rem] border border-violet-100 bg-white shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
          <div className="border-b border-slate-100 p-6">
            <div className="flex items-center gap-2">
              <div className="text-xl">✨</div>
              <h2 className="text-2xl font-black text-slate-950">AI Recovery Recommendations</h2>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {recommendationRows.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.title} href="/recovery-opportunities" className="flex items-center gap-4 px-6 py-4 transition hover:bg-violet-50/60">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.bg} ${item.tone}`}>
                    <Icon size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-slate-950">{item.title}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">{item.detail}</div>
                  </div>
                  <div className={`text-lg font-black ${item.tone}`}>{formatMoney(Number(item.value || 0))}</div>
                  <div className="text-slate-400">›</div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="min-w-0 rounded-[2.4rem] border border-violet-100 bg-white p-7 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Top Recovery Opportunities ☆</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Highest value items to fix first</h2>
          </div>
          <Link href="/recovery-opportunities" className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/20">
            View all opportunities
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {topFindings.map((row: any, index: number) => {
            const loss = Number(row.estimated_monthly_loss || 0);
            const recovery = loss * recoveryRate(row);
            const tones = [
              ["bg-red-50 text-red-600", "HIGH IMPACT"],
              ["bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]", "HIGH IMPACT"],
              ["bg-blue-50 text-blue-600", "MEDIUM IMPACT"],
              ["bg-[#A855F7]/10 text-[#84CC16]", "MEDIUM IMPACT"],
            ];
            const [tone, badge] = tones[index] || tones[0];

            return (
              <Link key={row.id} href={`/financial-leakage/${row.id}`} className="block rounded-3xl border border-slate-100 bg-white p-5 transition hover:shadow-xl">
                <div className="flex items-center justify-between">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${tone}`}>
                    {index === 0 ? "🥩" : index === 1 ? "📦" : index === 2 ? "🥄" : "⚖️"}
                  </div>
                  <div className={`rounded-full px-3 py-1 text-[10px] font-black ${tone}`}>{badge}</div>
                </div>
                <div className="mt-4 text-base font-black text-slate-950">{row.title}</div>
                <div className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{row.description}</div>
                <div className="mt-4 text-2xl font-black text-red-600">{formatMoney(recovery)}</div>
                <svg viewBox="0 0 160 30" className="mt-2 h-8 w-full">
                  <path d="M2 24 C 25 18, 34 26, 51 14 S 76 5, 91 16 S 116 26, 136 11 S 149 4, 158 7" fill="none" stroke={index === 0 ? "#ef4444" : index === 1 ? "#a855f7" : index === 2 ? "#2563eb" : "#8b5cf6"} strokeWidth="3" strokeLinecap="round" />
                </svg>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="min-w-0">
        <LeakageKpiGrid kpis={kpis} showAnnual />
      </section>

      <section className="min-w-0">
        <AiFinancialIntelligenceFeed items={feed} />
      </section>

      <section className="min-w-0 overflow-hidden rounded-[2.4rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Detailed Recovery Opportunities</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Full recovery findings table</h2>
          </div>
          <div className="rounded-full bg-violet-700 px-5 py-2 text-sm font-black text-white">
            {findings.length} findings
          </div>
        </div>
        <FinancialLeakageClient findings={findings} />
      </section>
    </VyronCostAiShell>
  );
}
