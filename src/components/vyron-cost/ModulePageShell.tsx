import type { ReactNode } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import type { VyronVisualVariant } from "@/components/vyron-premium/VyronPremiumTheme";

function variantFromEyebrow(eyebrow: string): VyronVisualVariant {
  const e = eyebrow.toLowerCase();
  if (e.includes("manufactur")) return "manufacturing";
  if (e.includes("report")) return "reports";
  if (e.includes("customer") || e.includes("sales")) return "customers";
  if (e.includes("inventory") || e.includes("stock")) return "inventory";
  if (e.includes("ingredient")) return "ingredients";
  if (e.includes("supplier")) return "suppliers";
  if (e.includes("procurement") || e.includes("purchase")) return "procurement";
  return "general";
}

export default function ModulePageShell({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  visualVariant,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
  visualVariant?: VyronVisualVariant;
}) {
  const variant = visualVariant ?? variantFromEyebrow(eyebrow);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: variant,
        badge: eyebrow,
        title,
        subtitle,
        outcomes: [
          "Review live operational data",
          "Export or print where available",
          "Drill into linked VYRON COST modules",
          "Act on margin and recovery signals",
        ],
      }}
      actions={actions}
    >
      {children}
    </VyronPremiumPageShell>
  );
}
