import type { ReactNode } from "react";
import {
  VyronPremiumControlPanel,
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumIntelligencePanel,
  VyronPremiumQuote,
  VyronPremiumFormulaLine,
} from "@/components/vyron-premium/VyronPremiumSprint";
import {
  VyronFooterStrip,
  VyronPageFrame,
  VyronQuoteCard,
} from "@/components/vyron-ui";
import {
  resolveDomainQuotes,
  VYRON_DOMAIN_FORMULAS,
  VYRON_DOMAIN_INTELLIGENCE,
  type VyronVisualVariant,
} from "@/components/vyron-premium/VyronPremiumTheme";

export type VyronPremiumPageConfig = {
  badge?: string;
  title: string;
  subtitle: string;
  controlTitle?: string;
  outcomes?: string[];
  quotes?: VyronPremiumQuote[];
  formulas?: Array<VyronPremiumFormulaLine | string>;
  formulaTitle?: string;
  formulaEyebrow?: string;
  intelligenceTitle?: string;
  intelligenceEyebrow?: string;
  intelligenceItems?: Array<{ label: string; detail: string }>;
  visualVariant?: VyronVisualVariant;
};

function normalizeFormulas(formulas?: Array<VyronPremiumFormulaLine | string>): VyronPremiumFormulaLine[] {
  if (!formulas) return [];
  return formulas.map((line) => {
    if (typeof line !== "string") return line;
    const split = line.includes(" = ") ? line.split(" = ") : line.split("=");
    if (split.length >= 2) {
      return { label: split[0].trim(), formula: split.slice(1).join("=").trim() };
    }
    return { label: "Formula", formula: line };
  });
}

export function VyronPremiumPageShell({
  config,
  children,
  actions,
  showFormulas = true,
  showIntelligence = true,
  showFooter = true,
  showSpotlight = true,
  showControlPanel = true,
}: {
  config: VyronPremiumPageConfig;
  children: ReactNode;
  actions?: ReactNode;
  showFormulas?: boolean;
  showIntelligence?: boolean;
  showFooter?: boolean;
  showSpotlight?: boolean;
  showControlPanel?: boolean;
}) {
  const {
    badge = "Premium VYRON COST Workspace",
    title,
    subtitle,
    controlTitle,
    outcomes = [],
    quotes,
    formulas,
    formulaTitle = "Key formulas",
    formulaEyebrow = "Formula Panel",
    intelligenceTitle = "What to watch",
    intelligenceEyebrow = "Signals",
    intelligenceItems,
    visualVariant = "general",
  } = config;

  const resolvedQuotes = resolveDomainQuotes(visualVariant, quotes);
  const domainFormulas = VYRON_DOMAIN_FORMULAS[visualVariant];
  const normalizedFormulas = normalizeFormulas(formulas?.length ? formulas : domainFormulas);
  const resolvedIntelligence = intelligenceItems?.length ? intelligenceItems : VYRON_DOMAIN_INTELLIGENCE[visualVariant];
  const spotlight = resolvedQuotes[0];

  return (
    <VyronPageFrame>
      <VyronPremiumHeroBanner badge={badge} title={title} subtitle={subtitle} outcomes={outcomes} visualVariant={visualVariant} />

      {showControlPanel && (actions || resolvedQuotes.length > 0) ? (
        <VyronPremiumControlPanel title={controlTitle ?? title} actions={actions} quotes={resolvedQuotes} />
      ) : null}

      {showFormulas || showIntelligence ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {showFormulas && normalizedFormulas.length > 0 ? (
            <VyronPremiumFormulaCard eyebrow={formulaEyebrow} title={formulaTitle} formulas={normalizedFormulas} variant="light" />
          ) : null}
          {showIntelligence && resolvedIntelligence.length > 0 ? (
            <VyronPremiumIntelligencePanel eyebrow={intelligenceEyebrow} title={intelligenceTitle} items={resolvedIntelligence} />
          ) : null}
        </div>
      ) : null}

      {children}

      {showSpotlight && spotlight ? <VyronQuoteCard quote={spotlight.quote} attribution={spotlight.label} /> : null}
      {showFooter ? <VyronFooterStrip /> : null}
    </VyronPageFrame>
  );
}
