import VyronCostPageShell from "@/components/vyron-cost/shared/VyronCostPageShell";
import StockLedgerClient from "@/components/vyron-cost/inventory/StockLedgerClient";

export default function Page() {
  return (
    <VyronCostPageShell
      title="Stock Traceability"
      subtitle="Trace finished goods back to manufacturing batches, supplier invoices, GRNs and consumed raw materials."
      backHref="/dashboard"
    >
      <StockLedgerClient />
    </VyronCostPageShell>
  );
}
