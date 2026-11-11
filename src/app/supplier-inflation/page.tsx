import RecoverableHeroCard from "@/components/RecoverableHeroCard";
import SupplierInflationImpactClient from "@/components/SupplierInflationImpactClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getLeakageKpis, getSupplierInflationImpact } from "@/lib/vyron-financial-command-data";
import { getWorkspaceCompanyId, shouldUseWorkspaceDemoData } from "@/lib/vyron-workspace-server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { AGREED_INFLATION_BASELINE, getInflationBaseline } from "@/lib/vyron-inflation-baseline";
import Link from "next/link";

/** The committed inflation baseline: a date, null when none is set, undefined when it could not be read. */
async function readInflationBaseline(): Promise<string | null | undefined> {
  try {
    const companyId = await getWorkspaceCompanyId();
    const supabase = companyId && isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
    if (!companyId || !supabase) return undefined;
    return await getInflationBaseline(supabase, companyId);
  } catch {
    return undefined;
  }
}

export default async function SupplierInflationPage() {
  const useDemo = await shouldUseWorkspaceDemoData();
  const [kpis, rows, baseline] = await Promise.all([getLeakageKpis(), getSupplierInflationImpact(), readInflationBaseline()]);
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
        <div className="mb-6 rounded-[2rem] border border-blue-100 bg-white p-8 text-center shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">Supplier inflation</div>
          <p className="mt-3 text-sm font-semibold text-slate-500">No data available</p>
        </div>
      ) : null}
      {!useDemo ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-blue-100 bg-white px-5 py-4 shadow-sm" data-testid="inflation-baseline-status">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">Historical inflation</div>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {baseline
                ? `Inflation baseline: ${baseline}. Price history before this date is excluded and each item is re-based on its first purchase since then; the history itself is never changed.`
                : baseline === null
                  ? `No inflation baseline is set, so inflation is measured over the full price history. The agreed baseline is ${AGREED_INFLATION_BASELINE}; an administrator sets it on the Inflation Baseline page after reviewing its impact.`
                  : "The inflation baseline could not be read."}{" "}
              This page compares each supplier's current and previous master cost; the re-based, dated view is on the Inflation Baseline page.
            </p>
          </div>
          <Link href="/supplier-inflation/history" className="rounded-2xl bg-[#1F4757] px-4 py-2.5 text-sm font-black text-white">
            Open Inflation Baseline
          </Link>
        </div>
      ) : null}
      <SupplierInflationImpactClient rows={hasWorkspaceData ? rows : []} />
    </VyronCostShell>
  );
}
