import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import type { VyronVisualVariant } from "@/components/vyron-premium/VyronPremiumTheme";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

type VyronPageHeroProps = {
  badge: string;
  title: string;
  subtitle: string;
  eyebrow?: string;
  limeHighlight?: string;
  outcomes?: string[];
  /** Compact hero for register pages - see VyronPageHero. */
  dense?: boolean;
  visualVariant?: VyronVisualVariant;
  rightPanel?: ReactNode;
  compact?: boolean;
};

export function VyronPageHero({
  badge,
  title,
  subtitle,
  eyebrow,
  limeHighlight,
  outcomes = [],
  dense = false,
}: VyronPageHeroProps) {
  /*
   * `dense` trims the hero for pages whose content is a transaction register:
   * same gradient, border, badge and type scale, just less padding and no
   * outcome chips, so the grid below starts near the fold instead of ~500px
   * down. Nothing carrying data is removed.
   */
  return (
    <section className={dense ? `${M.moduleHeaderNavy} !p-3 md:!p-3` : M.moduleHeaderNavy}>
      {!dense ? (
        <>
          <div className="pointer-events-none absolute -right-8 top-6 h-36 w-36 rounded-full bg-[#1D6BFF]/12 blur-3xl" />
          <div className="pointer-events-none absolute bottom-4 left-1/4 h-28 w-28 rounded-full bg-[#3B82F6]/8 blur-2xl" />
        </>
      ) : null}

      <div className={`relative ${dense ? "p-3" : "p-5 md:p-6"} ${M.dashboardHeroInner}`}>
        <div className={`flex min-w-0 flex-col justify-center ${dense ? "" : "max-w-3xl"}`}>
          {/* Dense pages put the badge on the title line rather than above it. */}
          <div className={dense ? "flex flex-wrap items-center gap-3" : ""}>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#CBD5E1]">
              <Sparkles size={13} className="shrink-0 text-[#3B82F6]" />
              <span className="break-words">{badge}</span>
            </div>

          {eyebrow ? (
            <div className={`mt-4 break-words text-[11px] font-bold uppercase tracking-[0.2em] ${M.mutedOnDark}`}>
              {eyebrow}
            </div>
          ) : null}

            <h1
              className={`break-words leading-[1.12] tracking-[-0.03em] text-balance ${
                dense ? "text-xl md:text-2xl" : "mt-2 text-3xl md:text-4xl"
              } ${M.headingOnDark}`}
            >
              {title}
              {limeHighlight ? <> <span className={M.gradientText}>{limeHighlight}</span></> : null}
            </h1>
          </div>

          <p className={`${dense ? "mt-1.5 line-clamp-1 text-xs" : "mt-4 break-words text-sm"} font-medium leading-6 ${M.bodyOnDark}`}>{subtitle}</p>

          {!dense && outcomes.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {outcomes.slice(0, 3).map((outcome) => (
                <span
                  key={outcome}
                  className="max-w-full break-words rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#CBD5E1]"
                >
                  {outcome}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
