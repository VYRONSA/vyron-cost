import { NextRequest, NextResponse } from "next/server";
import {
  getStoreOrderApprovalRules,
  saveStoreOrderApprovalRules,
} from "@/lib/vyron-store-order-commercial";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("store_ordering");
    await requireWorkspacePermission("store_orders.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, rules: null });
    const rules = await getStoreOrderApprovalRules(supabase, companyId);
    return NextResponse.json({ ok: true, rules });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load approval rules failed.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requirePackageFeature("store_ordering");
    await requireWorkspacePermission("store_orders.approve");
    const companyId = await requireApiCompanyId();
    const rules = await saveStoreOrderApprovalRules(supabase, companyId, {
      maxOrderValue: Number(body.maxOrderValue ?? body.max_order_value ?? 50000),
      minMarginPct: Number(body.minMarginPct ?? body.min_margin_pct ?? 25),
      maxQtyVariancePct: Number(body.maxQtyVariancePct ?? body.max_qty_variance_pct ?? 50),
      warnInactiveProducts: body.warnInactiveProducts !== false && body.warn_inactive_products !== false,
    });
    return NextResponse.json({ ok: true, rules });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Save approval rules failed.");
  }
}
