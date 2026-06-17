import VyronCostShell from "@/components/VyronCostShell";
import VyronCoreNav from "@/components/vyron-core/VyronCoreNav";
import VyronCoreSimulationClient from "@/components/vyron-core/VyronCoreSimulationClient";
import { getVyronCoreCommandCentreData } from "@/lib/vyron-workforce-digital-twin";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const dynamic = "force-dynamic";

export default async function VyronCoreSimulationsPage() {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  const data = await getVyronCoreCommandCentreData(supabase, VYRON_DEFAULT_TENANT_ID);

  return (
    <VyronCostShell hidePageHeader title="Workforce Simulation Engine"
      subtitle="WHAT-IF SCENARIOS · OVERTIME · HEADCOUNT · ATTRITION · FIELD · TRAVEL"
    >
      <VyronCoreNav />
      <VyronCoreSimulationClient initialSimulations={data.simulations} />
    </VyronCostShell>
  );
}
