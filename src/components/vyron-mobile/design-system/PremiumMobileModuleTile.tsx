import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import PremiumMobileCard from "@/components/vyron-mobile/design-system/PremiumMobileCard";
import { MOBILE_TYPOGRAPHY } from "@/components/vyron-mobile/design-system/mobile-design-tokens";

export default function PremiumMobileModuleTile({
  href,
  title,
  description,
  icon: Icon,
  eyebrow = "Open",
}: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  eyebrow?: string;
}) {
  return (
    <Link href={href} className={`${MOBILE_TYPOGRAPHY.family} block`}>
      <PremiumMobileCard tone="raised" pressable className="group relative overflow-hidden p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(199,154,43,0.12),transparent_42%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#07111F] text-white shadow-[0_12px_25px_rgba(7,17,31,0.2)] transition-transform duration-200 group-hover:scale-105">
            <Icon size={25} strokeWidth={2.1} />
          </div>
          <div className="rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            {eyebrow}
          </div>
        </div>

        <div className="relative mt-4 text-[1.08rem] font-black tracking-[-0.03em] text-slate-950">{title}</div>
        <div className="relative mt-1 text-sm font-semibold leading-6 text-slate-600">{description}</div>
      </PremiumMobileCard>
    </Link>
  );
}
