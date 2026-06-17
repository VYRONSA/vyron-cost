import PurchaseOrderIntelligenceClient from "@/components/PurchaseOrderIntelligenceClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProcurementRiskFindings } from "@/lib/vyron-leakage-intelligence-data";

export default async function PurchaseOrderIntelligencePage() {
  const risks = await getProcurementRiskFindings();

  return (
    <VyronCostShell hidePageHeader title="Purchase Order Intelligence"
      subtitle="PROCUREMENT RISK · PO CONTROL · SUPPLIER PRICE MOVEMENT"
    >
      <PurchaseOrderIntelligenceClient risks={risks} />
    </VyronCostShell>
  );
}
