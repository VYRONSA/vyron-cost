import type { ReactNode } from "react";
import { VyronPremiumPageShell, type VyronPremiumPageConfig } from "@/components/vyron-premium/VyronPremiumPageShell";

const AUTONOMOUS_DEFAULTS: Partial<VyronPremiumPageConfig> = {
  visualVariant: "executive",
  badge: "Autonomous Business Intelligence",
  quotes: [
    { label: "Decision support", quote: "What gets measured gets protected." },
    { label: "Predictive discipline", quote: "Small cost leaks become large financial problems." },
  ],
  intelligenceItems: [
    { label: "Explainable AI", detail: "Every signal shows formula, confidence and recommended action." },
    { label: "Cross-domain", detail: "Finance, inventory, procurement and production on one intelligence layer." },
    { label: "Action-oriented", detail: "Signals link to the VYRON COST pages where work gets done." },
  ],
};

export function AutonomousPremiumShell({
  title,
  subtitle,
  outcomes,
  children,
}: {
  title: string;
  subtitle: string;
  outcomes: string[];
  children: ReactNode;
}) {
  return (
    <VyronPremiumPageShell
      config={{
        ...AUTONOMOUS_DEFAULTS,
        title,
        subtitle,
        outcomes,
        formulaTitle: "Autonomous intelligence formulas",
        formulaEyebrow: "BI Engine",
        formulas: [
          { label: "Health Score", formula: "Weighted domain scores (finance, stock, procurement, production)" },
          { label: "Risk Probability", formula: "Signal strength × horizon exposure × confidence" },
          { label: "Recovery Impact", formula: "Identified leakage × action completion rate" },
        ],
        intelligenceTitle: "Autonomous BI Intelligence",
      }}
    >
      {children}
    </VyronPremiumPageShell>
  );
}
