import { NextRequest, NextResponse } from "next/server";
import {
  approveStockCount,
  getStockCountForCompany,
  postStockCount,
  submitStockCount,
  updateStockCountLine,
} from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  inventoryCompanyContextFromRequest,
  requireInventoryCompanyId,
} from "@/lib/vyron-inventory-api-context";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("inventory.view");
    const companyId = await requireInventoryCompanyId(supabase, inventoryCompanyContextFromRequest(request));
    const count = await getStockCountForCompany(supabase, companyId, id);
    const { data: lines, error } = await supabase
      .from("vyron_cost_stock_count_lines")
      .select("*, vyron_cost_stock_items(item_code, description, unit)")
      .eq("stock_count_id", id)
      .eq("company_id", companyId)
      .order("created_at");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json(
      { ok: true, count, lines: lines || [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load failed.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));

  try {
    const companyId = await requireInventoryCompanyId(supabase, inventoryCompanyContextFromRequest(request, body));
    await getStockCountForCompany(supabase, companyId, id);

    if (body.action === "updateLine" && body.lineId != null) {
      await requireWorkspacePermission("inventory.counts.create");
      await updateStockCountLine(supabase, companyId, String(body.lineId), Number(body.countedQty));
      return NextResponse.json({ ok: true });
    }
    if (body.action === "submit") {
      await requireWorkspacePermission("inventory.counts.create");
      await submitStockCount(supabase, companyId, id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "start") {
      await requireWorkspacePermission("inventory.counts.create");
      await supabase
        .from("vyron_cost_stock_counts")
        .update({ status: "In Progress", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "approve") {
      await requireWorkspacePermission("inventory.counts.approve");
      await approveStockCount(supabase, companyId, id, String(body.approvedBy || "supervisor"));
      return NextResponse.json({ ok: true });
    }
    if (body.action === "post") {
      await requireWorkspacePermission("inventory.adjustments.post");
      await postStockCount(supabase, companyId, id, String(body.actor || "supervisor"));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update failed.");
  }
}
