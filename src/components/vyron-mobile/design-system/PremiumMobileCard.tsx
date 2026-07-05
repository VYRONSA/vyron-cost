import type { ReactNode } from "react";
import { MOBILE_TOKENS } from "@/components/vyron-mobile/design-system/mobile-design-tokens";

type CardTone = "default" | "muted" | "raised";

const CARD_TONE_CLASS: Record<CardTone, string> = {
  default: MOBILE_TOKENS.surface.card,
  muted: MOBILE_TOKENS.surface.cardMuted,
  raised: MOBILE_TOKENS.surface.cardRaised,
};

export default function PremiumMobileCard({
  children,
  tone = "default",
  className = "",
  pressable = false,
}: {
  children: ReactNode;
  tone?: CardTone;
  className?: string;
  pressable?: boolean;
}) {
  const pressableClass = pressable
    ? `${MOBILE_TOKENS.touch.pressable} ${MOBILE_TOKENS.touch.liftHover}`
    : "";

  return (
    <div className={`${CARD_TONE_CLASS[tone]} ${pressableClass} ${className}`.trim()}>
      {children}
    </div>
  );
}
