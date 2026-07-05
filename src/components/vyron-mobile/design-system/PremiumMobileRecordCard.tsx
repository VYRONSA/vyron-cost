import type { LucideIcon } from "lucide-react";
import PremiumMobileCard from "@/components/vyron-mobile/design-system/PremiumMobileCard";
import PremiumMobileStatusBadge from "@/components/vyron-mobile/design-system/PremiumMobileStatusBadge";
import PremiumMobileButton from "@/components/vyron-mobile/design-system/PremiumMobileButton";
import type { MobileStatusTone } from "@/components/vyron-mobile/design-system/mobile-design-tokens";

type PremiumMobileRecordCardAction = {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
};

export default function PremiumMobileRecordCard({
  title,
  subtitle,
  meta,
  icon: Icon,
  status,
  statusTone,
  actions = [],
}: {
  title: string;
  subtitle: string;
  meta: Array<{ label: string; value: string }>;
  icon: LucideIcon;
  status: string;
  statusTone: MobileStatusTone;
  actions?: PremiumMobileRecordCardAction[];
}) {
  return (
    <PremiumMobileCard tone="default" className="relative overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(7,17,31,0.07),transparent_45%)]" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#07111F] text-white shadow-[0_10px_26px_rgba(7,17,31,0.24)]">
          <Icon size={20} />
        </div>
        <PremiumMobileStatusBadge label={status} tone={statusTone} />
      </div>

      <div className="relative mt-4 text-lg font-black tracking-[-0.03em] text-slate-950">{title}</div>
      <div className="relative mt-1 text-sm font-semibold text-slate-600">{subtitle}</div>

      <dl className="relative mt-4 grid grid-cols-2 gap-2">
        {meta.map((item) => (
          <div key={`${item.label}-${item.value}`} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
            <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</dt>
            <dd className="mt-1 text-sm font-bold text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>

      {actions.length ? (
        <div className="relative mt-4 flex gap-2 overflow-x-auto pb-1">
          {actions.map((action) => (
            <PremiumMobileButton
              key={action.id}
              variant={action.variant || "secondary"}
              href={action.href}
              onClick={action.onClick}
              size="compact"
            >
              {action.label}
            </PremiumMobileButton>
          ))}
        </div>
      ) : null}
    </PremiumMobileCard>
  );
}
