import ProductionRunNewClient from "@/components/ProductionRunNewClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function NewProductionRunPage() {
  return (
    <VyronCostAiShell hidePageHeader title="New Production Run" subtitle="Recipe / BOM · labour · overhead · stock validation">
      <ProductionRunNewClient />
    </VyronCostAiShell>
  );
}
