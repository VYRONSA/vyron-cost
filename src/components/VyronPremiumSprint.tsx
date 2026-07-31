import Link from "next/link";
import type { ReactNode } from "react";
import {
  BarChart3,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import {
  VyronPremiumHeroIllustration,
  VyronPremiumMiniCalculatorIcon,
  VyronPremiumMiniChartIcon,
} from "@/components/vyron-premium/VyronPremiumIllustrations";
import type { VyronVisualVariant } from "@/components/vyron-premium/VyronPremiumTheme";

export type VyronPremiumQuote = {
  label: string;
  quote: string;
};

export type VyronPremiumFormulaLine = {
  label: string;
  formula: string;
};

export const VYRON_ENTERPRISE_QUOTES: VyronPremiumQuote[] = [
  { label: "Margin discipline", quote: "Revenue is vanity. Margin is sanity." },
  { label: "Measurement", quote: "What gets measured gets protected." },
  { label: "Working capital", quote: "Inventory is cash wearing a disguise." },
  { label: "Procurement", quote: "Profit is often won before stock arrives." },
  { label: "Cost control", quote: "Small cost leaks become large financial problems." },
  { label: "Wealth building", quote: "Great businesses are built on disciplined margins." },
];

const OUTCOME_ICONS = [ShieldCheck, Target, Zap, BarChart3];

type VyronPremiumHeroBannerProps = {
  badge: string;
  title: string;
  subtitle: string;
  outcomes?: string[];
  visualVariant?: VyronVisualVariant;
  quotes?: VyronPremiumQuote[];
  actions?: ReactNode;
  children?: ReactNode;
  controlTitle?: string;
};

export function VyronPremiumHeroBanner({
  badge,
  title,
  subtitle,
  outcomes = [],
  visualVariant = "general",
  quotes,
  actions,
  children,
  controlTitle,
}: VyronPremiumHeroBannerProps) {
  const panelActions = actions ?? children;
  const panelQuotes = quotes ?? [];

  return (
    <section className="grid gap-5">
      <div className="relative overflow-hidden rounded-[2.4rem] border border-white/70 bg-gradient-to-br to-[var(--vyron-warning-bg)] via-rose-50 to-violet-50 p-0 shadow-[0_28px_90px_rgba(76,29,149,0.13)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_87%_10%,rgba(251,146,60,0.38),transparent_30%),radial-gradient(circle_at_78%_75%,rgba(45,212,191,0.18),transparent_34%),radial-gradient(circle_at_28%_16%,rgba(29,107,255,0.12),transparent_34%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white/50 to-transparent" />

        <div className="relative grid min-h-[350px] gap-8 p-7 md:p-9 xl:grid-cols-[1fr_0.95fr] xl:items-center">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200/70 bg-white/70 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-violet-700 shadow-sm backdrop-blur-xl">
              <Sparkles size={14} className="text-[var(--vyron-warning-fg)]" />
              {badge}
            </div>

            <h1 className="mt-6 text-5xl font-black tracking-[-0.06em] text-slate-950 md:text-6xl xl:text-7xl">
              {title}
            </h1>

            <p className="mt-4 max-w-2xl text-sm font-black uppercase leading-7 tracking-[0.13em] text-violet-700">
              {subtitle}
            </p>

            {outcomes.length > 0 ? (
              <div className="mt-8 grid max-w-4xl gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {outcomes.slice(0, 4).map((outcome, index) => {
                  const Icon = OUTCOME_ICONS[index % OUTCOME_ICONS.length];
                  return (
                    <div key={outcome} className="group rounded-[1.5rem] border border-white/80 bg-white/72 p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)] backdrop-blur-xl">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 via-white to-[var(--vyron-warning-bg)] text-violet-700 shadow-inner">
                        <Icon size={22} />
                      </div>
                      <p className="mt-3 text-sm font-black leading-5 text-slate-900">{outcome}</p>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="relative min-h-[260px]">
            <div className="absolute inset-0 rounded-[2.2rem] bg-gradient-to-br to-[var(--vyron-warning-bg)] via-pink-300/16 to-violet-500/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2.2rem] border border-white/60 bg-white/45 p-5 shadow-[0_24px_70px_rgba(76,29,149,0.16)] backdrop-blur-xl">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_14%,rgba(251,146,60,0.28),transparent_30%),radial-gradient(circle_at_15%_84%,rgba(45,212,191,0.15),transparent_34%)]" />
              <div className="relative">
                <VyronPremiumHeroIllustration variant={visualVariant} />
              </div>
            </div>

            {panelQuotes[0] ? (
              <div className="absolute -bottom-4 right-4 max-w-sm rounded-[1.6rem] bg-gradient-to-br from-violet-700 via-fuchsia-600 to-[var(--vyron-warning-bg)] p-5 text-white shadow-[0_22px_55px_rgba(236,72,153,0.35)]">
                <div className="text-4xl font-black leading-none text-white/75">&ldquo;</div>
                <p className="-mt-1 text-sm font-black leading-6">&ldquo;{panelQuotes[0].quote}&rdquo;</p>
                <div className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--vyron-warning-fg)]">— {panelQuotes[0].label}</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {(panelActions || panelQuotes.length > 1) ? (
        <VyronPremiumControlPanel title={controlTitle ?? title} actions={panelActions} quotes={panelQuotes.slice(1)} />
      ) : null}
    </section>
  );
}

type VyronPremiumControlPanelProps = {
  title: string;
  actions?: ReactNode;
  quotes: VyronPremiumQuote[];
};

export function VyronPremiumControlPanel({ title, actions, quotes }: VyronPremiumControlPanelProps) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#1a0b2e] via-[#2a0f4f] to-[#080315] p-6 text-white shadow-[0_24px_70px_rgba(76,29,149,0.22)] ring-1 ring-white/10">
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[var(--vyron-warning-bg)] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-1/2 h-56 w-56 rounded-full bg-indigo-400/12 blur-3xl" />

      <div className="relative grid gap-5 xl:grid-cols-[1fr_0.9fr] xl:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--vyron-warning-border)] bg-white/8 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--vyron-warning-fg)]">
            <Sparkles size={13} />
            Premium Workspace
          </div>
          <h3 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">{title}</h3>
          {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
        </div>

        {quotes.length > 0 ? (
          <div className="grid gap-3">
            {quotes.slice(0, 2).map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-md">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--vyron-warning-fg)]">
                  <ShieldCheck size={14} className="text-indigo-300" />
                  {item.label}
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-100">&ldquo;{item.quote}&rdquo;</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function VyronPremiumQuoteCard({ label, quote, className = "" }: { label: string; quote: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-violet-700 via-fuchsia-600 to-[var(--vyron-warning-bg)] p-6 text-white shadow-[0_22px_55px_rgba(236,72,153,0.30)] ${className}`}>
      <div className="pointer-events-none absolute -right-6 -top-6 text-[100px] font-black leading-none text-white/10">&ldquo;</div>
      <div className="relative text-[10px] font-black uppercase tracking-[0.16em] text-[var(--vyron-warning-fg)]">{label}</div>
      <p className="relative mt-3 text-lg font-black leading-7">&ldquo;{quote}&rdquo;</p>
    </div>
  );
}

export function VyronPremiumSpotlightQuote({ quote, attribution }: { quote: string; attribution: string }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br to-[var(--vyron-warning-bg)] via-rose-500 to-violet-700 p-8 text-white shadow-[0_24px_65px_rgba(249,115,22,0.35)] md:p-10">
      <div className="pointer-events-none absolute -right-8 -top-8 text-[120px] font-black leading-none text-white/10">&ldquo;</div>
      <p className="relative max-w-3xl text-xl font-black leading-snug md:text-2xl">&ldquo;{quote}&rdquo;</p>
      <p className="relative mt-4 text-sm font-black uppercase tracking-[0.16em] text-[var(--vyron-warning-fg)]">— {attribution}</p>
    </div>
  );
}

export function VyronPremiumFooterStrip() {
  const items = [
    { label: "Reduce Cost Leakage", icon: Wallet },
    { label: "Improve Accuracy", icon: Target },
    { label: "Increase Margins", icon: TrendingUp },
    { label: "Drive Performance", icon: BarChart3 },
  ];
  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-slate-950 via-violet-950 to-slate-950 px-6 py-5 text-white shadow-[0_22px_60px_rgba(15,23,42,0.26)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_100%,rgba(45,212,191,0.18),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(251,146,60,0.22),transparent_30%)]" />
      <p className="relative text-center text-[10px] font-black uppercase tracking-[0.2em] text-violet-200 md:text-xs">
        Cost Intelligence · Operational Discipline · Profit Protection
      </p>
      <div className="relative mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map(({ label, icon: Icon }) => (
          <div key={label} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-[10px] font-black uppercase tracking-wide text-slate-200 md:text-xs">
            <Icon size={16} className="text-[var(--vyron-warning-fg)]" />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function VyronPremiumFormulaCard({
  eyebrow = "Formula Panel",
  title,
  formulas,
  variant = "dark",
  className = "",
}: {
  eyebrow?: string;
  title: string;
  formulas: VyronPremiumFormulaLine[];
  variant?: "dark" | "light";
  className?: string;
}) {
  const isDark = variant === "dark";
  return (
    <aside
      className={`relative overflow-hidden rounded-[2rem] p-6 ${
        isDark
          ? "bg-gradient-to-br from-[#1a0b2e] via-[#12081f] to-[#07110d] text-white shadow-[0_18px_55px_rgba(29,78,216,0.22)] ring-1 ring-violet-500/20"
          : "border border-[var(--vyron-warning-border)] bg-gradient-to-br to-[var(--vyron-warning-bg)] via-white to-violet-50/60 text-slate-900 shadow-[0_18px_50px_rgba(251,146,60,0.08)]"
      } ${className}`}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[var(--vyron-warning-bg)] blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className={`text-xs font-black uppercase tracking-[0.2em] ${isDark ? "text-[var(--vyron-warning-fg)]" : "text-violet-600"}`}>{eyebrow}</div>
          <h3 className="mt-2 text-xl font-black md:text-2xl">{title}</h3>
          <div className={`mt-5 space-y-3 text-sm font-semibold leading-7 ${isDark ? "text-slate-200" : "text-slate-700"}`}>
            {formulas.map((line) => (
              <p key={line.label}>
                <span className={`font-black ${isDark ? "text-indigo-200" : "text-slate-900"}`}>{line.label}</span> = {line.formula}
              </p>
            ))}
          </div>
        </div>
        <div className="shrink-0 opacity-90">
          <VyronPremiumMiniCalculatorIcon />
        </div>
      </div>
    </aside>
  );
}

export function VyronPremiumIntelligencePanel({
  title,
  eyebrow = "Intelligence",
  items,
}: {
  title: string;
  eyebrow?: string;
  items: Array<{ label: string; detail: string }>;
}) {
  return (
    <aside className="relative overflow-hidden rounded-[2rem] border border-indigo-100/80 bg-gradient-to-br from-indigo-50/50 via-white to-[var(--vyron-warning-bg)] p-6 shadow-[0_20px_55px_rgba(45,212,191,0.12)]">
      <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-indigo-300/20 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-700">{eyebrow}</div>
          <h3 className="mt-1 text-xl font-black text-slate-950">{title}</h3>
          <div className="mt-5 grid gap-3">
            {items.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/90 bg-white/85 p-4 shadow-sm">
                <div className="text-xs font-black uppercase tracking-[0.1em] text-violet-700">{item.label}</div>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="shrink-0 opacity-90">
          <VyronPremiumMiniChartIcon />
        </div>
      </div>
    </aside>
  );
}

export function VyronPremiumInsightCard({ category, message, href }: { category: string; message: string; href?: string }) {
  const body = href ? (
    <Link href={href} className="text-violet-700 hover:underline">
      {message}
    </Link>
  ) : (
    message
  );
  return (
    <li className="rounded-2xl border border-[var(--vyron-warning-border)] bg-gradient-to-r from-white to-[var(--vyron-warning-bg)] px-5 py-4 text-sm font-semibold leading-6 text-slate-800 shadow-sm">
      <span className="mr-2 inline-block rounded-lg bg-gradient-to-r to-[var(--vyron-warning-bg)] to-fuchsia-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--vyron-warning-fg)]">
        {category}
      </span>
      {body}
    </li>
  );
}

export function VyronPremiumSectionHeading({ eyebrow, title, subtitle, icon, actions }: { eyebrow?: string; title: string; subtitle?: string; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="flex items-start gap-4">
        {icon ? <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 via-white to-[var(--vyron-warning-bg)] text-violet-700 shadow-inner">{icon}</div> : null}
        <div>
          {eyebrow ? <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">{eyebrow}</div> : null}
          <h3 className={`font-black tracking-[-0.02em] text-slate-950 ${eyebrow ? "mt-1 text-2xl" : "text-2xl"}`}>{title}</h3>
          {subtitle ? <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function VyronPremiumMetricCard({ label, value, href, icon, note, tone = "default" }: { label: string; value: ReactNode; href: string; icon?: ReactNode; note?: string; tone?: "default" | "warning" | "danger" }) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-gradient-to-br from-red-50/80 to-white"
      : tone === "warning"
        ? "border-fuchsia-200 bg-gradient-to-br from-fuchsia-50/90 to-white"
        : "border-violet-100/80 bg-gradient-to-br from-white via-violet-50/30 to-[var(--vyron-warning-bg)]";
  return (
    <Link href={href} className={`rounded-[2rem] border p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)] transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_26px_70px_rgba(76,29,149,0.14)] ${toneClass}`}>
      {icon ? <div className="text-violet-600">{icon}</div> : null}
      <div className={`text-[10px] font-black uppercase tracking-[0.12em] text-violet-600 ${icon ? "mt-3" : ""}`}>{label}</div>
      <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
      {note ? <div className="mt-1 text-xs font-semibold text-slate-500">{note}</div> : null}
    </Link>
  );
}

export function VyronPremiumInsightsPanel({ title, icon, children, empty }: { title: string; icon?: ReactNode; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="rounded-[2rem] border border-[var(--vyron-warning-border)] bg-gradient-to-br to-[var(--vyron-warning-bg)] via-fuchsia-50/40 to-white p-6 md:p-8">
      <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-[var(--vyron-warning-fg)]">
        {icon}
        {title}
      </div>
      {children ? <ul className="mt-5 grid gap-3">{children}</ul> : empty}
    </div>
  );
}

export function VyronPremiumEmptyState({ title = "Getting Started", steps }: { title?: string; steps: string[] }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-[var(--vyron-warning-border)] bg-gradient-to-br to-[var(--vyron-warning-bg)] via-violet-50/40 to-white p-8 text-center md:p-10">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">{title}</div>
      <ol className="mx-auto mt-6 max-w-lg space-y-3 text-left text-sm font-semibold leading-6 text-slate-700">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 rounded-xl border border-white/80 bg-white/70 px-3 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-700 to-[var(--vyron-warning-bg)] text-xs font-black text-white">{index + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
