import InventoryLedgerClient from "@/components/InventoryLedgerClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function InventoryLedgerPage() {
  return (
    <VyronCostAiShell title="Stock Ledger" subtitle="Permanent audit of every inventory movement">
      <InventoryLedgerClient />
    </VyronCostAiShell>
  );
}
