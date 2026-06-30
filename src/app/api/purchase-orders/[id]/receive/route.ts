import { NextRequest, NextResponse } from "next/server";
import { receivePurchaseOrderStock } from "@/lib/vyron-purchase-order-engine";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("goods_receipts.create");
    const companyId = await resolveApiCompanyIdWithContext(supabase, {
      workspaceId: request.nextUrl.searchParams.get("workspaceId"),
      companyId: request.nextUrl.searchParams.get("companyId") || (typeof body.companyId === "string" ? body.companyId : null),
    });
    if (!companyId) throw new Error("No active workspace company.");

    const { id } = await context.params;
    const mode = body.mode === "partial" ? "partial" : "full";
    const purchaseOrder = await receivePurchaseOrderStock(supabase, companyId, id, {
      mode,
      lines: Array.isArray(body.lines) ? body.lines : undefined,
      actor: body.actor || body.received_by || "user",
    });
    return NextResponse.json({ ok: true, purchaseOrder });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Receive stock failed.");
  }
}
