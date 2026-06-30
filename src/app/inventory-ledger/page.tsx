import VyronCostAiShell from "@/components/VyronCostAiShell";
import InventoryLedgerPageClient from "@/components/vyron-cost/inventory/InventoryLedgerPageClient";

export default function InventoryLedgerPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Inventory Ledger" subtitle="Transaction engine audit trail with running balance">
      <InventoryLedgerPageClient />
    </VyronCostAiShell>
  );
}
