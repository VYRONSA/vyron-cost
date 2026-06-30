import VyronCostAiShell from "@/components/VyronCostAiShell";
import StoreOrderDashboardClient from "@/components/vyron-cost/store-ordering/StoreOrderDashboardClient";

export default function StoreOrderDashboardPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Order Dashboard" subtitle="Store ordering commercial and operations snapshot.">
      <StoreOrderDashboardClient />
    </VyronCostAiShell>
  );
}
