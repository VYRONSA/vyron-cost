import VyronCostAiShell from "@/components/VyronCostAiShell";
import StoresClient from "@/components/vyron-cost/store-ordering/StoresClient";

export default function StoresPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Stores" subtitle="Store master for ordering finished goods.">
      <StoresClient />
    </VyronCostAiShell>
  );
}
