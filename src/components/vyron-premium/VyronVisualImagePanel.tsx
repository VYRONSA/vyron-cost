"use client";

export type VyronVisualKey =
  | "dashboard"
  | "suppliers"
  | "ingredients"
  | "products"
  | "recipes"
  | "purchaseOrders"
  | "goodsReceipts"
  | "inventory"
  | "manufacturing"
  | "finishedGoods"
  | "customers"
  | "reports"
  | "executive"
  | "ai";

const VISUALS: Record<VyronVisualKey, string> = {
  dashboard: "/vyron-visuals/dashboard-command-centre.svg",
  suppliers: "/vyron-visuals/suppliers-intelligence.svg",
  ingredients: "/vyron-visuals/ingredients-costing.svg",
  products: "/vyron-visuals/products-profitability.svg",
  recipes: "/vyron-visuals/recipes-bom.svg",
  purchaseOrders: "/vyron-visuals/purchase-orders.svg",
  goodsReceipts: "/vyron-visuals/goods-receipts.svg",
  inventory: "/vyron-visuals/inventory-intelligence.svg",
  manufacturing: "/vyron-visuals/manufacturing-intelligence.svg",
  finishedGoods: "/vyron-visuals/finished-goods.svg",
  customers: "/vyron-visuals/customers-invoices.svg",
  reports: "/vyron-visuals/reports-command.svg",
  executive: "/vyron-visuals/executive-boardroom.svg",
  ai: "/vyron-visuals/ai-cost-intelligence.svg",
};

export function VyronVisualImagePanel({
  visual,
  className = "",
}: {
  visual: VyronVisualKey;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-[2.4rem] bg-[#09031f] p-3 shadow-[0_30px_90px_rgba(76,29,149,0.24)] ${className}`}>
      <img
        src={VISUALS[visual]}
        alt=""
        className="h-full min-h-[380px] w-full rounded-[2rem] object-cover"
      />
    </div>
  );
}

export { VISUALS as VYRON_VISUAL_ASSETS };
