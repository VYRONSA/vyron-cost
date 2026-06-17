import RecoverableHeroCard from "@/components/RecoverableHeroCard";
import SupplierInflationImpactClient from "@/components/SupplierInflationImpactClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getLeakageKpis, getSupplierInflationImpact } from "@/lib/vyron-financial-command-data";
import { shouldUseWorkspaceDemoData } from "@/lib/vyron-workspace-server";

export default async function SupplierInflationPage() {
  const useDemo = await shouldUseWorkspaceDemoData();
  const [kpis, rows] = await Promise.all([getLeakageKpis(), getSupplierInflationImpact()]);
  const hasWorkspaceData = rows.length > 0;
  const showDemoHero = useDemo && hasWorkspaceData;

  return (
    <VyronCostShell hidePageHeader title="Supplier Inflation Impact" subtitle="IMPORTED MATERIAL COSTS · ANNUAL EXPOSURE">
      {showDemoHero ? (
        <RecoverableHeroCard
          kpis={{
            ...kpis,
            moneyAtRisk: kpis.supplierInflationExposure,
            recoverableMonthly: Math.round(kpis.supplierInflationExposure / 12),
            recoverableAnnual: kpis.supplierInflationExposure,
          }}
        />
      ) : !hasWorkspaceData ? (
        <div className="mb-6 rounded-[2rem] border border-violet-100 bg-white p-8 text-center shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">Supplier inflation</div>
          <p className="mt-3 text-sm font-semibold text-slate-500">No data available</p>
        </div>
      ) : null}
      <SupplierInflationImpactClient rows={hasWorkspaceData ? rows : []} />
    </VyronCostShell>
  );
}
