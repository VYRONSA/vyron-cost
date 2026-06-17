import { NextRequest, NextResponse } from "next/server";
import { completeProductionRun } from "@/lib/vyron-manufacturing";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  manufacturingCompanyContextFromRequest,
  requireManufacturingCompanyId,
} from "@/lib/vyron-manufacturing-api-context";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    await requireWorkspacePermission("manufacturing.runs.complete");
    const companyId = await requireManufacturingCompanyId(supabase, manufacturingCompanyContextFromRequest(request, body));
    const run = await completeProductionRun(supabase, companyId, id, {
      actual_qty: Number(body.actual_qty || 0),
      line_actuals: body.line_actuals,
      wastage: body.wastage,
      stock_override: Boolean(body.stock_override),
      stock_override_reason: body.stock_override_reason,
      completed_by: body.completed_by || "user",
    });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    if (error instanceof Error && error.message === "STOCK_SHORTAGE") {
      const shortages = (error as Error & { shortages?: unknown }).shortages;
      return NextResponse.json({ ok: false, error: "Stock shortage", shortages }, { status: 409 });
    }
    return workspaceAccessErrorResponse(error, "Complete failed.");
  }
}
