import SupplierNegotiationPackClient from "@/components/SupplierNegotiationPackClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";

export default async function SupplierNegotiationPackPage() {
  const suppliers = await getSupplierIntelligenceRows();

  return (
    <VyronCostShell
      title="Supplier Negotiation Pack"
      subtitle="PRICE MOVEMENT · NEGOTIATION VALUE · SUPPLIER ACTIONS"
    >
      <SupplierNegotiationPackClient suppliers={suppliers} />
    </VyronCostShell>
  );
}
