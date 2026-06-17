import BackOrdersClient from "@/components/BackOrdersClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function BackOrdersPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Back Orders" subtitle="Outstanding PO quantities · supplier follow-up · receive balance">
      <BackOrdersClient />
    </VyronCostAiShell>
  );
}
