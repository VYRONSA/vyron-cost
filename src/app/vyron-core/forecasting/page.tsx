import VyronCostShell from "@/components/VyronCostShell";
import VyronCoreNav from "@/components/vyron-core/VyronCoreNav";
import VyronCoreForecastingClient from "@/components/vyron-core/VyronCoreForecastingClient";
import { getVyronCoreCommandCentreData } from "@/lib/vyron-workforce-digital-twin";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const dynamic = "force-dynamic";

export default async function VyronCoreForecastingPage() {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  const data = await getVyronCoreCommandCentreData(supabase, VYRON_DEFAULT_TENANT_ID);

  return (
    <VyronCostShell hidePageHeader title="Workforce Forecasting"
      subtitle="LABOUR COST · PRODUCTIVITY · ATTRITION · LEAKAGE · HEALTH FORECASTS"
    >
      <VyronCoreNav />
      <VyronCoreForecastingClient data={data} />
    </VyronCostShell>
  );
}
