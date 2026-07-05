import type { ReactNode } from "react";
import PremiumMobileCard from "@/components/vyron-mobile/design-system/PremiumMobileCard";
import { MOBILE_TOKENS, MOBILE_TYPOGRAPHY } from "@/components/vyron-mobile/design-system/mobile-design-tokens";

export default function PremiumMobileExecutiveHeader({
  title,
  subtitle,
  workspaceLabel,
  workspaceControl,
  notificationControl,
  profileControl,
}: {
  title: string;
  subtitle?: string;
  workspaceLabel: string;
  workspaceControl: ReactNode;
  notificationControl: ReactNode;
  profileControl: ReactNode;
}) {
  return (
    <header className={`${MOBILE_TYPOGRAPHY.family} sticky top-0 z-30 border-b border-white/70 bg-[#F8FAFD]/90 backdrop-blur-xl`}>
      <div className="px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.8rem)] sm:px-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">{workspaceControl}</div>
          <div className="shrink-0">{notificationControl}</div>
          <div className="shrink-0">{profileControl}</div>
        </div>

        <PremiumMobileCard tone="default" className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(199,154,43,0.16),transparent_46%)]" />

          <div className="relative text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Executive Workspace</div>
          <div className={`relative mt-1 truncate ${MOBILE_TOKENS.text.title}`}>{title}</div>
          {subtitle ? <div className={`relative mt-2 max-w-2xl ${MOBILE_TOKENS.text.body}`}>{subtitle}</div> : null}
          <div className="relative mt-3 inline-flex rounded-full border border-[#E8D6A4] bg-[#FFF9EC] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#A77915]">
            {workspaceLabel}
          </div>
        </PremiumMobileCard>
      </div>
    </header>
  );
}
