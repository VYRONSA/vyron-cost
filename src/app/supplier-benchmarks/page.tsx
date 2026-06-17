import SupplierBenchmarkCentreClient from "@/components/SupplierBenchmarkCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";

export default async function SupplierBenchmarksPage() {
  const rows = await getSupplierIntelligenceRows();

  return (
    <VyronCostShell hidePageHeader title="Supplier Benchmarks"
      subtitle="COMPARE · NEGOTIATE · RECOVER PROCUREMENT SAVINGS"
    >
      <SupplierBenchmarkCentreClient rows={rows} />
    </VyronCostShell>
  );
}
