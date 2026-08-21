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
  panelsBelowContent = false,
  dense = false,
}: {
  config: VyronPremiumPageConfig;
  children: ReactNode;
  actions?: ReactNode;
  showFormulas?: boolean;
  showIntelligence?: boolean;
  showFooter?: boolean;
  showSpotlight?: boolean;
  showControlPanel?: boolean;
  /**
   * Render the formula and intelligence panels AFTER the page content.
   *
   * They are reference material, not working data. Above a transaction register
   * they push the grid most of a viewport down the page, so the operator opens
   * an invoice list and sees three rows. Below it they stay one scroll away and
   * the register gets the fold. Purely an ordering change — same panels, same
   * styling, same props.
   */
  panelsBelowContent?: boolean;
  /**
   * Compact the page chrome for register pages.
   *
   * Trims the hero and drops the control panel's decorative quote column while
   * keeping its action buttons. On the supplier register this moved the top of
   * the grid from 1186px down the page to inside the first screen.
   */
  dense?: boolean;
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

  const referencePanels =
    showFormulas || showIntelligence ? (
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {showFormulas && normalizedFormulas.length > 0 ? (
          <VyronPremiumFormulaCard eyebrow={formulaEyebrow} title={formulaTitle} formulas={normalizedFormulas} variant="light" />
        ) : null}
        {showIntelligence && resolvedIntelligence.length > 0 ? (
          <VyronPremiumIntelligencePanel eyebrow={intelligenceEyebrow} title={intelligenceTitle} items={resolvedIntelligence} />
        ) : null}
      </div>
    ) : null;

  return (
    <VyronPageFrame>
      <VyronPremiumHeroBanner
        badge={badge}
        title={title}
        subtitle={subtitle}
        outcomes={outcomes}
        visualVariant={visualVariant}
        dense={dense}
      />

      {showControlPanel && dense && actions ? (
        /*
         * Dense pages surface the actions on their own rather than inside the
         * control-panel card. The card contributes ~90px of border, padding and
         * a repeated page title above a register that needs the rows.
         */
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : showControlPanel && !dense && (actions || resolvedQuotes.length > 0) ? (
        <VyronPremiumControlPanel title={controlTitle ?? title} actions={actions} quotes={resolvedQuotes} />
      ) : null}

      {!panelsBelowContent ? referencePanels : null}

      {children}

      {panelsBelowContent ? referencePanels : null}

      {showSpotlight && spotlight ? <VyronQuoteCard quote={spotlight.quote} attribution={spotlight.label} /> : null}
      {showFooter ? <VyronFooterStrip /> : null}
    </VyronPageFrame>
  );
}
