import VyronCostAiShell from "@/components/VyronCostAiShell";
import FinishedGoodsClient from "@/components/vyron-cost/inventory/FinishedGoodsClient";

export default function Page() {
  return (
    <VyronCostAiShell hidePageHeader title="Finished Goods"
      subtitle="MANUFACTURED PRODUCTS READY FOR SALE, STOCK COVER, VALUE, COST AND MOVEMENT INTELLIGENCE."
    >
      <FinishedGoodsClient />
    </VyronCostAiShell>
  );
}
