import SupplierScorecardsClient from "@/components/SupplierScorecardsClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";

export default async function SupplierScorecardsPage() {
  const rows = await getSupplierIntelligenceRows();

  return (
    <VyronCostShell
      title="Supplier Scorecards"
      subtitle="SUPPLIER RISK · NEGOTIATION · PRICE MOVEMENT · RELIABILITY"
    >
      <SupplierScorecardsClient rows={rows} />
    </VyronCostShell>
  );
}
