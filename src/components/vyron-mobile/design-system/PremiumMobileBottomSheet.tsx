import type { ReactNode } from "react";
import PremiumMobileButton from "@/components/vyron-mobile/design-system/PremiumMobileButton";
import { MOBILE_TYPOGRAPHY } from "@/components/vyron-mobile/design-system/mobile-design-tokens";

export default function PremiumMobileBottomSheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className={`${MOBILE_TYPOGRAPHY.family} vyron-mobile-sheet-backdrop fixed inset-0 z-50 flex items-end bg-slate-950/48 backdrop-blur-[2px]`}
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      role="presentation"
      tabIndex={-1}
    >
      <div
        className="vyron-mobile-sheet-panel w-full rounded-t-[2rem] border-t border-white/70 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-24px_60px_rgba(15,23,42,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{title}</div>
          <PremiumMobileButton variant="secondary" size="compact" onClick={onClose}>
            Close
          </PremiumMobileButton>
        </div>
        {children}
      </div>
    </div>
  );
}
