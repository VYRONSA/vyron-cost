import GoodsReceiptDashboardClient from "@/components/GoodsReceiptDashboardClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function GoodsReceiptsPage() {
  return (
    <VyronCostAiShell title="Goods Received Notes" subtitle="PO RECEIPTS · PARTIALS · BACK ORDERS · VARIANCES">
      <GoodsReceiptDashboardClient />
    </VyronCostAiShell>
  );
}
