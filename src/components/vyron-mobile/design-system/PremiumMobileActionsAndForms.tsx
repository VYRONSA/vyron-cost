import { ChevronDown, Calendar } from "lucide-react";
import type { ReactNode } from "react";
import PremiumMobileButton from "@/components/vyron-mobile/design-system/PremiumMobileButton";
import PremiumMobileCard from "@/components/vyron-mobile/design-system/PremiumMobileCard";
import { MOBILE_TYPOGRAPHY } from "@/components/vyron-mobile/design-system/mobile-design-tokens";

export function PremiumMobileStickyActionBar({
  actions,
}: {
  actions: Array<{
    id: string;
    label: string;
    variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
    onClick?: () => void;
    href?: string;
    loading?: boolean;
    disabled?: boolean;
  }>;
}) {
  if (!actions.length) return null;

  return (
    <div className={`${MOBILE_TYPOGRAPHY.family} fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.8rem)] z-30 px-4 sm:px-5`}>
      <PremiumMobileCard tone="raised" className="p-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {actions.map((action) => (
            <PremiumMobileButton
              key={action.id}
              variant={action.variant || "secondary"}
              href={action.href}
              onClick={action.onClick}
              loading={action.loading}
              disabled={action.disabled}
              className="min-w-[9rem]"
            >
              {action.label}
            </PremiumMobileButton>
          ))}
        </div>
      </PremiumMobileCard>
    </div>
  );
}

export function PremiumMobileTextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  name,
  rightControl,
}: {
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "number" | "tel";
  name?: string;
  rightControl?: ReactNode;
}) {
  return (
    <label className={`${MOBILE_TYPOGRAPHY.family} block`}>
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="flex min-h-14 items-center gap-2 rounded-[1.05rem] border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
        <input
          className="min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-900 outline-none placeholder:text-slate-400"
          type={type}
          name={name}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
        />
        {rightControl}
      </div>
    </label>
  );
}

export function PremiumMobileSelect({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${MOBILE_TYPOGRAPHY.family} flex min-h-14 w-full items-center gap-2 rounded-[1.05rem] border border-slate-200 bg-white px-4 py-3 text-left shadow-[0_8px_20px_rgba(15,23,42,0.05)]`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</div>
      </div>
      <ChevronDown size={16} className="text-slate-400" />
    </button>
  );
}

export function PremiumMobileDateField({ label, value }: { label: string; value: string }) {
  return (
    <label className={`${MOBILE_TYPOGRAPHY.family} flex min-h-14 w-full items-center gap-3 rounded-[1.05rem] border border-slate-200 bg-white px-4 py-3 text-left shadow-[0_8px_20px_rgba(15,23,42,0.05)]`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
        <Calendar size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
        <input
          type="date"
          defaultValue={value}
          className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
        />
      </div>
    </label>
  );
}
