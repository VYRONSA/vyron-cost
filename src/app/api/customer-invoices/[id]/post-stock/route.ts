import { NextRequest, NextResponse } from "next/server";
import { postCustomerInvoiceStock } from "@/lib/vyron-customer-invoices";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  try {
    await requireWorkspacePermission("invoices.reverse");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    let allowOverride = Boolean(body.allowOverride);
    if (allowOverride) {
      await requireWorkspacePermission("inventory.adjustments.post");
    }

    const result = await postCustomerInvoiceStock(supabase, companyId, id, {
      actor: String(body.actor || "user"),
      allowOverride,
      updateInvoiceStatus: body.updateInvoiceStatus !== false,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Post stock failed.");
  }
}
