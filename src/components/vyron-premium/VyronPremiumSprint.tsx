import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import {
  VyronFooterStrip,
  VyronMetricCard,
  VyronPageHero,
  VyronQuoteCard,
  VyronSurfaceCard,
} from "@/components/vyron-ui";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";
import type { VyronVisualVariant } from "@/components/vyron-premium/VyronPremiumTheme";
import { resolveDomainQuotes, VYRON_VISUAL_LABELS } from "@/components/vyron-premium/VyronPremiumTheme";

const M = VYRON_MASTER;

export type VyronPremiumQuote = { label: string; quote: string };
export type VyronPremiumFormulaLine = { label: string; formula: string };

export const VYRON_ENTERPRISE_QUOTES: VyronPremiumQuote[] = [
  { label: "Margin discipline", quote: "Revenue is vanity. Margin is sanity." },
  { label: "Measurement", quote: "What gets measured gets protected." },
  { label: "Working capital", quote: "Inventory is cash wearing a disguise." },
  { label: "Procurement", quote: "Profit is often won before stock arrives." },
  { label: "Cost control", quote: "Small cost leaks become large financial problems." },
  { label: "Wealth building", quote: "Great businesses are built on disciplined margins." },
];

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
  const panelQuotes = resolveDomainQuotes(visualVariant, quotes);
  const labels = VYRON_VISUAL_LABELS[visualVariant] || VYRON_VISUAL_LABELS.general;
  const shouldShowControlPanel = Boolean(panelActions || quotes?.length);

  return (
    <>
      <VyronPageHero badge={badge} title={title} subtitle={subtitle} outcomes={outcomes} visualVariant={visualVariant} />
      {shouldShowControlPanel ? (
        <VyronPremiumControlPanel title={controlTitle ?? labels.title} actions={panelActions} quotes={panelQuotes} />
      ) : null}
    </>
  );
}

type VyronPremiumControlPanelProps = { title?: string; actions?: ReactNode; quotes: VyronPremiumQuote[]; showTitle?: boolean };

export function VyronPremiumControlPanel({ title, actions, quotes, showTitle = true }: VyronPremiumControlPanelProps) {
  const quotesOnly = !showTitle && !actions;

  return (
    <div className={`${M.modulePanel} p-6`}>
      <div className={`relative grid min-w-0 gap-5 ${quotesOnly ? "" : "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] xl:items-start"}`}>
        {showTitle || actions ? (
          <div className="min-w-0">
            {showTitle && title ? (
              <>
                <div className={M.eyebrow}>
                  <Sparkles size={13} className="text-[#7C3AED]" /> Workspace Control
                </div>
                <h3 className={`mt-3 break-words text-2xl tracking-tight text-balance md:text-3xl ${M.heading}`}>{title}</h3>
              </>
            ) : null}
            {actions ? <div className={`flex flex-wrap gap-3 ${showTitle && title ? "mt-5" : ""}`}>{actions}</div> : null}
          </div>
        ) : null}

        {quotes.length > 0 ? (
          <div className={`grid min-w-0 gap-3 ${quotesOnly ? "md:grid-cols-2" : ""}`}>
            {quotes.slice(0, 2).map((item) => (
              <div key={item.label} className={M.modulePanelNested}>
                <div className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] ${M.muted}`}>
                  <ShieldCheck size={14} className="text-[#7C3AED]" /> {item.label}
                </div>
                <p className={`mt-2 text-sm font-medium leading-6 ${M.body}`}>&ldquo;{item.quote}&rdquo;</p>
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
    <div className={`${M.lightCard} p-6 ${className}`}>
      <div className={`text-[11px] font-bold uppercase tracking-[0.14em] ${M.muted}`}>{label}</div>
      <p className={`mt-3 text-lg font-bold leading-7 ${M.heading}`}>&ldquo;{quote}&rdquo;</p>
    </div>
  );
}

export function VyronPremiumSpotlightQuote({ quote, attribution }: { quote: string; attribution: string }) {
  return <VyronQuoteCard quote={quote} attribution={attribution} />;
}

export function VyronPremiumFooterStrip() {
  return <VyronFooterStrip />;
}

export function VyronPremiumFormulaCard({
  eyebrow = "Formula Panel",
  title,
  formulas,
  variant = "light",
  className = "",
}: {
  eyebrow?: string;
  title: string;
  formulas: VyronPremiumFormulaLine[];
  variant?: "dark" | "light";
  className?: string;
}) {
  if (variant === "dark") {
    return (
      <aside className={`${M.dashboardHero} p-6 ${className}`}>
        <div className={`p-5 ${M.dashboardHeroInner}`}>
          <div className={`text-[11px] font-bold uppercase tracking-[0.16em] ${M.mutedOnDark}`}>{eyebrow}</div>
          <h3 className={`mt-2 text-xl md:text-2xl ${M.headingOnDark}`}>{title}</h3>
          <div className={`mt-5 space-y-3 text-sm font-medium leading-7 ${M.bodyOnDark}`}>
            {formulas.map((line) => (
              <p key={line.label}>
                <span className="font-bold text-[#9333EA]">{line.label}</span> = {line.formula}
              </p>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <VyronSurfaceCard className={className} title={title} subtitle={eyebrow}>
      <div className={`space-y-3 text-sm font-medium leading-7 ${M.body}`}>
        {formulas.map((line) => (
          <p key={line.label}>
            <span className={`font-bold ${M.heading}`}>{line.label}</span> = {line.formula}
          </p>
        ))}
      </div>
    </VyronSurfaceCard>
  );
}

export function VyronPremiumIntelligencePanel({
  title,
  eyebrow = "Signals",
  items,
}: {
  title: string;
  eyebrow?: string;
  items: Array<{ label: string; detail: string }>;
}) {
  return (
    <aside className={`${M.moduleIntelligenceNavy} p-6`}>
      <div className={`text-[11px] font-bold uppercase tracking-[0.16em] ${M.mutedOnDark}`}>{eyebrow}</div>
      <h3 className={`mt-1 text-xl ${M.headingOnDark}`}>{title}</h3>
      <div className="mt-5 grid gap-3">
        {items.map((item) => (
          <div key={item.label} className={M.dashboardHeroRow}>
            <div className="text-xs font-bold uppercase tracking-[0.1em] text-[#9333EA]">{item.label}</div>
            <p className={`mt-1 text-sm font-medium leading-6 ${M.bodyOnDark}`}>{item.detail}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function VyronPremiumInsightCard({ category, message, href }: { category: string; message: string; href?: string }) {
  const body = href ? (
    <Link href={href} className="text-[#7C3AED] hover:underline">
      {message}
    </Link>
  ) : (
    message
  );
  return (
    <li className={`rounded-xl border border-[#E2E8F0] bg-white px-5 py-4 text-sm font-medium leading-6 ${M.body}`}>
      <span className="mr-2 inline-block rounded-lg border border-[#F43F5E]/20 bg-[#F43F5E]/8 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#E11D48]">
        {category}
      </span>
      {body}
    </li>
  );
}

export function VyronPremiumSectionHeading({
  eyebrow,
  title,
  subtitle,
  icon,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="flex items-start gap-4">
        {icon ? <div className={`h-11 w-11 shrink-0 ${M.iconSubtle}`}>{icon}</div> : null}
        <div>
          {eyebrow ? <div className={`text-[11px] font-bold uppercase tracking-[0.16em] ${M.muted}`}>{eyebrow}</div> : null}
          <h3 className={`font-black tracking-[-0.02em] ${M.heading} ${eyebrow ? "mt-1 text-2xl" : "text-2xl"}`}>{title}</h3>
          {subtitle ? <p className={`mt-1 text-sm font-medium leading-6 ${M.body}`}>{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function VyronPremiumMetricCard({
  label,
  value,
  href,
  icon,
  note,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  href: string;
  icon?: ReactNode;
  note?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const mappedTone = tone === "warning" ? "warning" : tone === "danger" ? "danger" : "default";
  return <VyronMetricCard label={label} value={value} href={href} icon={icon} note={note} tone={mappedTone} />;
}

export function VyronPremiumInsightsPanel({
  title,
  icon,
  children,
  empty,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  empty?: ReactNode;
}) {
  return (
    <VyronSurfaceCard>
      <div className={`mb-5 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] ${M.muted}`}>
        {icon}
        {title}
      </div>
      {children ? <ul className="grid gap-3">{children}</ul> : empty}
    </VyronSurfaceCard>
  );
}

export function VyronPremiumEmptyState({ title = "Getting Started", steps }: { title?: string; steps: string[] }) {
  return (
    <div className={M.moduleEmptyState}>
      <div className={`text-[11px] font-bold uppercase tracking-[0.16em] ${M.muted}`}>{title}</div>
      <ol className={`mx-auto mt-6 max-w-lg space-y-3 text-left text-sm font-medium leading-6 ${M.body}`}>
        {steps.map((step, index) => (
          <li key={step} className={`flex gap-3 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2`}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#7C3AED]/20 bg-[#F6F7FB] text-xs font-bold text-[#7C3AED]">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
