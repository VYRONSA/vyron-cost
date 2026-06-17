import { NextRequest, NextResponse } from "next/server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { getProcurementRecommendationsForSupplier } from "@/lib/vyron-procurement-ai-data";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: supplierId } = await context.params;
  const supplierName = request.nextUrl.searchParams.get("name") || undefined;
  try {
    await requireWorkspacePermission("suppliers.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json({ ok: true, recommendations: [] });
    }

    let name = supplierName;
    if (!name && isSupabaseServiceRoleConfigured()) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { data } = await supabase
          .from("vyron_cost_suppliers")
          .select("supplier_name")
          .eq("id", supplierId)
          .eq("company_id", companyId)
          .maybeSingle();
        name = data?.supplier_name ? String(data.supplier_name) : undefined;
      }
    }
    const recommendations = await getProcurementRecommendationsForSupplier(supplierId, name);
    return NextResponse.json({ ok: true, recommendations });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load failed.");
  }
}
