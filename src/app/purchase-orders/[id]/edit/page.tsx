import ProcurementPoFormClient from "@/components/ProcurementPoFormClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let suppliers: Array<{ id: string; supplier_name: string }> = [];

  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from("vyron_cost_suppliers")
        .select("id, supplier_name")
        .eq("company_id", VYRON_DEFAULT_TENANT_ID)
        .order("supplier_name");
      suppliers = (data || []) as Array<{ id: string; supplier_name: string }>;
    }
  }

  return (
    <VyronCostAiShell title="Edit Purchase Order" subtitle="UPDATE LINES · SUPPLIER · DELIVERY">
      <ProcurementPoFormClient suppliers={suppliers} poId={id} />
    </VyronCostAiShell>
  );
}
