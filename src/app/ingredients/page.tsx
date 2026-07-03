import IngredientManagerClient from "@/components/IngredientManagerClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { type CostIngredient, type CostSupplier, demoIngredients, demoSuppliers } from "@/lib/vyron-cost-core-data";
import { listIngredients, listSuppliers } from "@/lib/vyron-cost-master-data";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export default async function IngredientsPage() {
  const { useDemo, companyId } = await workspaceScope();
  let ingredients: CostIngredient[] = useDemo ? demoIngredients : [];
  let suppliers: CostSupplier[] = useDemo ? demoSuppliers : [];

  if (!useDemo && companyId && isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        [ingredients, suppliers] = await Promise.all([
          listIngredients(supabase, companyId),
          listSuppliers(supabase, companyId),
        ]);
      } catch {
        ingredients = [];
        suppliers = [];
      }
    }
  }

  return (
    <VyronCostAiShell hidePageHeader title="Ingredients" subtitle="Manage ingredient costs, suppliers, yield and price movement.">
      <IngredientManagerClient initialIngredients={ingredients} suppliers={suppliers} />
    </VyronCostAiShell>
  );
}
