import RecoverableHeroCard from "@/components/RecoverableHeroCard";
import SupplierInflationImpactClient from "@/components/SupplierInflationImpactClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getLeakageKpis, getSupplierInflationImpact } from "@/lib/vyron-financial-command-data";

export default async function SupplierInflationPage() {
  const [kpis, rows] = await Promise.all([getLeakageKpis(), getSupplierInflationImpact()]);

  return (
    <VyronCostShell title="Supplier Inflation Impact" subtitle="IMPORTED MATERIAL COSTS · ANNUAL EXPOSURE">
      <RecoverableHeroCard
        kpis={{
          ...kpis,
          moneyAtRisk: kpis.supplierInflationExposure,
          recoverableMonthly: Math.round(kpis.supplierInflationExposure / 12),
          recoverableAnnual: kpis.supplierInflationExposure,
        }}
      />
      <SupplierInflationImpactClient rows={rows} />
    </VyronCostShell>
  );
}
