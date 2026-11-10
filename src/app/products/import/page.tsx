import VyronCostAiShell from "@/components/VyronCostAiShell";
import FinishedGoodsImportClient from "@/components/vyron-cost/products/FinishedGoodsImportClient";

export default function FinishedGoodsImportPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Finished Goods Import" subtitle="Update and add finished goods by Item Code from Excel or CSV">
      <FinishedGoodsImportClient />
    </VyronCostAiShell>
  );
}
