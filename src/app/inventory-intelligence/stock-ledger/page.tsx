import VyronCostPageShell from "@/components/vyron-cost/shared/VyronCostPageShell";
import StockLedgerClient from "@/components/vyron-cost/inventory/StockLedgerClient";

export default function Page() {
  return (
    <VyronCostPageShell
      title="Stock Ledger"
      subtitle="Every stock movement posted from GRNs, manufacturing, sales invoices, stock counts and adjustments."
      backHref="/dashboard"
    >
      <StockLedgerClient />
    </VyronCostPageShell>
  );
}
