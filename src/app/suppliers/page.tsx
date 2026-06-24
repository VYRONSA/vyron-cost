import SupplierManagerClient from "@/components/SupplierManagerClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { demoSuppliers, type CostSupplier } from "@/lib/vyron-cost-core-data";
import { listSuppliers } from "@/lib/vyron-cost-master-data";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export default async function SuppliersPage() {
  const { useDemo, companyId } = await workspaceScope();
  let suppliers: CostSupplier[] = useDemo ? demoSuppliers : [];

  if (!useDemo && companyId && isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        suppliers = await listSuppliers(supabase, companyId);
      } catch {
        suppliers = [];
      }
    }
  }

  return (
    <VyronCostAiShell hidePageHeader title="Suppliers" subtitle="Manage suppliers, risk, price movement and invoice contacts.">
      <SupplierManagerClient initialSuppliers={suppliers} />
    </VyronCostAiShell>
  );
}
