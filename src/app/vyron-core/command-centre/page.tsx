import VyronCostShell from "@/components/VyronCostShell";
import VyronCoreNav from "@/components/vyron-core/VyronCoreNav";
import VyronCoreCommandCentreClient from "@/components/vyron-core/VyronCoreCommandCentreClient";
import { getVyronCoreCommandCentreData } from "@/lib/vyron-workforce-digital-twin";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const dynamic = "force-dynamic";

export default async function VyronCoreCommandCentrePage() {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  const data = await getVyronCoreCommandCentreData(supabase, VYRON_DEFAULT_TENANT_ID);

  return (
    <VyronCostShell hidePageHeader title="VYRON CORE Executive Command Centre"
      subtitle="WORKFORCE DIGITAL TWIN · LABOUR · PRODUCTIVITY · HEALTH · RISK · LEAKAGE"
    >
      <VyronCoreNav />
      <VyronCoreCommandCentreClient data={data} />
    </VyronCostShell>
  );
}
