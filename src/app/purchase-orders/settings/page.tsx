import PurchaseOrderSettingsClient from "@/components/PurchaseOrderSettingsClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function PurchaseOrderSettingsPage() {
  return (
    <VyronCostAiShell title="PO Approval Settings" subtitle="Thresholds and invoice linking policy">
      <PurchaseOrderSettingsClient />
    </VyronCostAiShell>
  );
}
