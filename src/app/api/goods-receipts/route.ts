import { NextRequest, NextResponse } from "next/server";
import { createGoodsReceipt, listGoodsReceipts } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function requireGrnCompanyId(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  ctx: { workspaceId?: string | null; companyId?: string | null }
) {
  const companyId = await resolveApiCompanyIdWithContext(supabase, ctx);
  if (!companyId) throw new Error("No active workspace company. Select a client workspace first.");
  return companyId;
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("goods_receipts.view");
    const companyId = await requireGrnCompanyId(supabase, companyContextFromRequest(request));
    const receipts = await listGoodsReceipts(supabase, companyId);
    return NextResponse.json(
      { ok: true, receipts },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List failed.");
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  try {
    await requireWorkspacePermission("goods_receipts.create");
    const companyId = await requireGrnCompanyId(supabase, companyContextFromRequest(request, body));
    const result = await createGoodsReceipt(supabase, companyId, {
      purchase_order_id: String(body.purchase_order_id),
      receipt_type: body.receipt_type === "full" ? "full" : "partial",
      received_by: body.received_by,
      notes: body.notes,
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "GRN failed.");
  }
}
