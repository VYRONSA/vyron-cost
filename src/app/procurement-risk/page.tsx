import ProcurementRiskClient from "@/components/ProcurementRiskClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProcurementRiskFindings } from "@/lib/vyron-leakage-intelligence-data";

export default async function ProcurementRiskPage() {
  const rows = await getProcurementRiskFindings();
  return (
    <VyronCostShell title="Procurement Intelligence" subtitle="Supplier inflation, duplicate invoices and suspicious purchasing patterns.">
      <ProcurementRiskClient rows={rows} />
    </VyronCostShell>
  );
}
