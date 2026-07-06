import { NextRequest, NextResponse } from "next/server";
import { setPurchaseOrderArchiveState } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function companyContextFromRequest(request: NextRequest, body?: Record<string, unknown>) {
  return {
    workspaceId:
      request.nextUrl.searchParams.get("workspaceId") ||
      (typeof body?.workspaceId === "string" ? body.workspaceId : null),
    companyId:
      request.nextUrl.searchParams.get("companyId") ||
      (typeof body?.companyId === "string" ? body.companyId : null),
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "archive").toLowerCase() === "restore" ? "restore" : "archive";

  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.delete");

    const companyId = await resolveApiCompanyIdWithContext(supabase, companyContextFromRequest(request, body));
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    const result = await setPurchaseOrderArchiveState(supabase, {
      companyId,
      poId: id,
      archived: action === "archive",
      actor: String(body.actor || "user"),
      reason: String(body.reason || "").trim() || undefined,
    });

    return NextResponse.json({ ok: true, ...result, action });
  } catch (error) {
    return workspaceAccessErrorResponse(error, `${action === "archive" ? "Archive" : "Restore"} failed.`);
  }
}
