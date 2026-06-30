import VyronCostAiShell from "@/components/VyronCostAiShell";
import StockMovementsPageClient from "@/components/vyron-cost/inventory/StockMovementsPageClient";

export default function StockMovementsPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Stock Movements" subtitle="Receive, issue, adjust and count stock">
      <StockMovementsPageClient />
    </VyronCostAiShell>
  );
}
