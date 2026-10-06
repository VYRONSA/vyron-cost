import VyronCostAiShell from "@/components/VyronCostAiShell";
import StockTakeUploadClient from "@/components/vyron-cost/inventory/StockTakeUploadClient";

export default function StockTakeUploadPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Stock Take Upload" subtitle="Upload → review variances → approve → post">
      <StockTakeUploadClient />
    </VyronCostAiShell>
  );
}
