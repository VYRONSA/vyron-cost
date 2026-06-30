import { NextRequest, NextResponse } from "next/server";
import { generatePurchaseOrdersFromRequisition } from "@/lib/vyron-purchase-order-engine";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("procurement");
    await requireWorkspacePermission("purchase_orders.create");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    const result = await generatePurchaseOrdersFromRequisition(supabase, companyId, id, "user");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Generate purchase orders failed.");
  }
}
