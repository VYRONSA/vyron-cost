import { Mic, Search } from "lucide-react";
import PremiumMobileButton from "@/components/vyron-mobile/design-system/PremiumMobileButton";
import PremiumMobileCard from "@/components/vyron-mobile/design-system/PremiumMobileCard";
import { MOBILE_TYPOGRAPHY } from "@/components/vyron-mobile/design-system/mobile-design-tokens";

export default function PremiumMobileSearch({
  placeholder,
  value,
  onChange,
  recent = [],
  emptyMessage = "Search modules, records, and actions.",
  onRecentSelect,
}: {
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
  recent?: string[];
  emptyMessage?: string;
  onRecentSelect?: (value: string) => void;
}) {
  return (
    <section className={`${MOBILE_TYPOGRAPHY.family} px-4 sm:px-5`}>
      <PremiumMobileCard tone="default" className="p-4">
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Search</div>
        <div className="flex min-h-14 items-center gap-3 rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <Search size={18} className="text-slate-400" />
          <input
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-900 outline-none placeholder:text-slate-400"
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
          />
          <PremiumMobileButton variant="ghost" size="compact">
            <Mic size={16} />
            Voice
          </PremiumMobileButton>
        </div>

        {recent.length ? (
          <div className="mt-3">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Recent Searches</div>
            <div className="flex flex-wrap gap-2">
              {recent.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => onRecentSelect?.(item)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-500">
            {emptyMessage}
          </div>
        )}
      </PremiumMobileCard>
    </section>
  );
}
