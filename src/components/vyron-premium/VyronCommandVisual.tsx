"use client";

export type VyronVisualKey =
  | "dashboard"
  | "recovery"
  | "supplier"
  | "margin"
  | "inventory"
  | "manufacturing"
  | "ingredients"
  | "products"
  | "procurement"
  | "reports"
  | "executive";

const VYRON_VISUALS: Record<VyronVisualKey, string> = {
  dashboard: "/vyron-visuals/dashboard-cinematic-command.svg",
  recovery: "/vyron-visuals/recovery-command-centre.svg",
  supplier: "/vyron-visuals/supplier-command-centre.svg",
  margin: "/vyron-visuals/margin-command-centre.svg",
  inventory: "/vyron-visuals/inventory-command-centre.svg",
  manufacturing: "/vyron-visuals/manufacturing-command-centre.svg",
  ingredients: "/vyron-visuals/ingredients-command-centre.svg",
  products: "/vyron-visuals/products-command-centre.svg",
  procurement: "/vyron-visuals/procurement-command-centre.svg",
  reports: "/vyron-visuals/reports-command-centre.svg",
  executive: "/vyron-visuals/executive-boardroom-command.svg",
};

export function VyronCommandVisual({
  visual,
  className = "",
  imageClassName = "",
}: {
  visual: VyronVisualKey;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-[2.6rem] bg-[#09031f] p-3 shadow-[0_30px_90px_rgba(76,29,149,.25)] ${className}`}>
      <img
        src={VYRON_VISUALS[visual]}
        alt=""
        className={`h-full min-h-[420px] w-full rounded-[2.2rem] object-cover ${imageClassName}`}
      />
    </div>
  );
}

export { VYRON_VISUALS };
