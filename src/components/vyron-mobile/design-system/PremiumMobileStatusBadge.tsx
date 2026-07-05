import { MOBILE_STATUS_TONES, type MobileStatusTone } from "@/components/vyron-mobile/design-system/mobile-design-tokens";

export default function PremiumMobileStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: MobileStatusTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${MOBILE_STATUS_TONES[tone]}`}
    >
      {label}
    </span>
  );
}
