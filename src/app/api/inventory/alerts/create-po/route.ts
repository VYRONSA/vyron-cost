import { NextRequest, NextResponse } from "next/server";
import { createReplenishmentPoFromAlert } from "@/lib/vyron-inventory";
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

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  if (!body.alertId) return NextResponse.json({ ok: false, error: "alertId is required." }, { status: 400 });
  try {
    await requireWorkspacePermission("purchase_orders.create");
    const companyId = await requireInventoryCompanyId(supabase, inventoryCompanyContextFromRequest(request, body));
    const po = await createReplenishmentPoFromAlert(supabase, companyId, String(body.alertId), String(body.actor || "user"));
    return NextResponse.json({ ok: true, po });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "PO creation failed.");
  }
}
