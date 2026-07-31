import type { LucideIcon } from "lucide-react";
import PremiumMobileCard from "@/components/vyron-mobile/design-system/PremiumMobileCard";
import PremiumMobileStatusBadge from "@/components/vyron-mobile/design-system/PremiumMobileStatusBadge";
import type { MobileStatusTone } from "@/components/vyron-mobile/design-system/mobile-design-tokens";
import { MOBILE_TYPOGRAPHY } from "@/components/vyron-mobile/design-system/mobile-design-tokens";

export type PremiumMobileKpiItem = {
  id: string;
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone: MobileStatusTone;
};

export default function PremiumMobileKpiCarousel({
  title,
  items,
}: {
  title: string;
  items: PremiumMobileKpiItem[];
}) {
  return (
    <section className={`${MOBILE_TYPOGRAPHY.family} px-4 sm:px-5`}>
      <div className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{title}</div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <PremiumMobileCard
              key={item.id}
              tone="raised"
              className="group relative min-w-[82%] snap-start overflow-hidden p-5 sm:min-w-[360px]"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(7,17,31,0.07),transparent_48%)]" />

              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                  <div className="mt-2 text-[2.15rem] font-black tracking-[-0.05em] text-slate-950">{item.value}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">{item.note}</div>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl vyron-grad-surface text-white shadow-[0_14px_30px_rgba(7,17,31,0.24)]">
                  <Icon size={23} />
                </div>
              </div>

              <div className="relative mt-4">
                <PremiumMobileStatusBadge label={item.tone} tone={item.tone} />
              </div>
            </PremiumMobileCard>
          );
        })}
      </div>
    </section>
  );
}
