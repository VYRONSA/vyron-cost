import type { LucideIcon } from "lucide-react";
import PremiumMobileButton from "@/components/vyron-mobile/design-system/PremiumMobileButton";
import PremiumMobileCard from "@/components/vyron-mobile/design-system/PremiumMobileCard";
import { MOBILE_TYPOGRAPHY } from "@/components/vyron-mobile/design-system/mobile-design-tokens";

export function PremiumMobileEmptyState({
  title,
  description,
  icon: Icon,
  primaryAction,
  secondaryAction,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  primaryAction?: { label: string; href?: string; onClick?: () => void };
  secondaryAction?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <PremiumMobileCard tone="default" className={`${MOBILE_TYPOGRAPHY.family} relative overflow-hidden p-6 text-center`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(199,154,43,0.14),transparent_46%)]" />

      <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-[2rem] bg-[#07111F] text-white shadow-[0_16px_34px_rgba(7,17,31,0.18)]">
        <Icon size={30} />
      </div>

      <div className="relative mt-4 text-xl font-black tracking-[-0.03em] text-slate-950">{title}</div>
      <p className="relative mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-500">{description}</p>

      <div className="relative mt-5 grid gap-2 sm:grid-cols-2">
        {primaryAction ? (
          <PremiumMobileButton
            href={primaryAction.href}
            onClick={primaryAction.onClick}
            fullWidth
          >
            {primaryAction.label}
          </PremiumMobileButton>
        ) : null}
        {secondaryAction ? (
          <PremiumMobileButton
            variant="secondary"
            href={secondaryAction.href}
            onClick={secondaryAction.onClick}
            fullWidth
          >
            {secondaryAction.label}
          </PremiumMobileButton>
        ) : null}
      </div>
    </PremiumMobileCard>
  );
}

export function PremiumMobileCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent_20%,rgba(255,255,255,0.55)_45%,transparent_70%)]" />
      <div className="animate-pulse space-y-3">
        <div className="h-3 w-28 rounded-full bg-slate-200" />
        <div className="h-8 w-36 rounded-xl bg-slate-200" />
        <div className="h-4 w-full rounded-full bg-slate-200" />
      </div>
    </div>
  );
}

export function PremiumMobileListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={`mobile-list-skeleton-${index}`}
          className="rounded-[1.35rem] border border-slate-100 bg-slate-50 p-4"
        >
          <div className="animate-pulse space-y-2">
            <div className="h-3 w-28 rounded-full bg-slate-200" />
            <div className="h-5 w-44 rounded-lg bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
