import type { VyronVisualVariant } from "@/components/vyron-premium/VyronPremiumTheme";

const IMAGE_BY_VARIANT: Record<VyronVisualVariant, string> = {
  general: "/vyron-visuals/dashboard.svg",
  ingredients: "/vyron-visuals/ingredients.svg",
  suppliers: "/vyron-visuals/suppliers.svg",
  products: "/vyron-visuals/products.svg",
  procurement: "/vyron-visuals/procurement.svg",
  "goods-receipt": "/vyron-visuals/goods-receipt.svg",
  inventory: "/vyron-visuals/inventory.svg",
  manufacturing: "/vyron-visuals/manufacturing.svg",
  customers: "/vyron-visuals/customers.svg",
  reports: "/vyron-visuals/reports.svg",
  executive: "/vyron-visuals/executive.svg",
  recovery: "/vyron-visuals/recovery.svg",
  finance: "/vyron-visuals/finance.svg",
};

/**
 * Real image-based hero.
 * Place the SVG files from /public/vyron-visuals into your Next.js public folder.
 */
export function VyronPremiumHeroIllustration({ variant = "general" }: { variant?: VyronVisualVariant }) {
  const src = IMAGE_BY_VARIANT[variant] || IMAGE_BY_VARIANT.general;
  return (
    <div className="relative h-full min-h-[430px] w-full overflow-hidden rounded-[2.2rem]">
      <img src={src} alt="" className="h-full min-h-[430px] w-full object-cover" />
    </div>
  );
}

export function VyronPremiumIllustration({
  variant = "general",
  hero = false,
}: {
  variant?: VyronVisualVariant;
  hero?: boolean;
}) {
  const src = IMAGE_BY_VARIANT[variant] || IMAGE_BY_VARIANT.general;
  return (
    <div className={hero ? "h-full min-h-[430px] w-full overflow-hidden rounded-[2rem]" : "h-full min-h-[260px] w-full overflow-hidden rounded-[1.5rem]"}>
      <img src={src} alt="" className="h-full w-full object-cover" />
    </div>
  );
}

export function VyronPremiumMiniChartIcon() {
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20" aria-hidden>
      <defs>
        <linearGradient id="miniChartRealImages" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#1d6bff" />
          <stop offset="0.5" stopColor="#c084fc" />
          <stop offset="1" stopColor="#2dd4bf" />
        </linearGradient>
      </defs>
      <rect x="8" y="48" width="12" height="24" rx="3" fill="url(#miniChartRealImages)" opacity="0.75" />
      <rect x="26" y="30" width="12" height="42" rx="3" fill="url(#miniChartRealImages)" />
      <rect x="44" y="38" width="12" height="34" rx="3" fill="url(#miniChartRealImages)" opacity="0.85" />
      <rect x="62" y="18" width="12" height="54" rx="3" fill="url(#miniChartRealImages)" />
      <path d="M10 44 Q30 20 48 34 T74 16" stroke="#c084fc" strokeWidth="3" fill="none" />
    </svg>
  );
}

export function VyronPremiumMiniCalculatorIcon() {
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20" aria-hidden>
      <defs>
        <linearGradient id="calcGradRealImages" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#4c1d95" />
          <stop offset="0.55" stopColor="#1e1033" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect x="10" y="8" width="60" height="64" rx="14" fill="url(#calcGradRealImages)" stroke="#c084fc" strokeWidth="2" />
      <rect x="18" y="16" width="44" height="14" rx="5" fill="#2dd4bf" opacity="0.7" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={18 + (i % 3) * 16} y={36 + Math.floor(i / 3) * 14} width="12" height="10" rx="3" fill="rgba(255,255,255,0.28)" />
      ))}
    </svg>
  );
}
