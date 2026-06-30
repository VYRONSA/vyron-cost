import { NextRequest, NextResponse } from "next/server";
import {
  STORE_ORDER_WORKFLOW_ACTIONS,
  applyStoreOrderWorkflowAction,
} from "@/lib/vyron-store-orders";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const APPROVAL_ACTIONS = new Set(["approve", "reject", "request_change"]);

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  if (!STORE_ORDER_WORKFLOW_ACTIONS.includes(action as (typeof STORE_ORDER_WORKFLOW_ACTIONS)[number])) {
    return NextResponse.json({ ok: false, error: "Valid workflow action is required." }, { status: 400 });
  }

  try {
    await requirePackageFeature("store_ordering");
    const permission = APPROVAL_ACTIONS.has(action) ? "store_orders.approve" : "store_orders.edit";
    await requireWorkspacePermission(permission);
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    const order = await applyStoreOrderWorkflowAction(supabase, companyId, id, action, {
      note: typeof body.note === "string" ? body.note : undefined,
      actor: typeof body.actor === "string" ? body.actor : undefined,
    });
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Workflow action failed.");
  }
}
