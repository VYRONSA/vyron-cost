import MarginBridgeClient from "@/components/MarginBridgeClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";

export default async function MarginBridgePage() {
  const products = await getProductIntelligence();

  return (
    <VyronCostShell
      title="Margin Bridge"
      subtitle="ACTUAL GP · TARGET GP · MONTHLY BRIDGE VALUE"
    >
      <MarginBridgeClient products={products} />
    </VyronCostShell>
  );
}
