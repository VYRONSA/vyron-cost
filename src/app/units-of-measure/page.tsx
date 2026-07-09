import VyronCostAiShell from "@/components/VyronCostAiShell";
import UnitsOfMeasureManager from "@/components/UnitsOfMeasureManager";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { listUnitsOfMeasure } from "@/lib/vyron-units-of-measure";

export default async function UnitsOfMeasurePage() {
  let initialUnits: Array<{
    id: string;
    code: string;
    name: string;
    symbol: string | null;
    category: string;
    decimal_precision: number;
    is_active: boolean;
    notes: string | null;
  }> = [];

  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    const companyId = await resolveApiCompanyId();
    if (supabase && companyId) {
      initialUnits = await listUnitsOfMeasure(supabase, companyId);
    }
  }

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Units of Measure"
      subtitle="Tenant-scoped UOM master for products, recipes, inventory and reporting consistency."
    >
      <UnitsOfMeasureManager initialUnits={initialUnits} />
    </VyronCostAiShell>
  );
}
