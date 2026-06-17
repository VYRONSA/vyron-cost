import { NextRequest, NextResponse } from "next/server";
import { transitionProductionRun } from "@/lib/vyron-manufacturing";
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
    await requireWorkspacePermission("manufacturing.runs.create");
    const companyId = await requireManufacturingCompanyId(supabase, manufacturingCompanyContextFromRequest(request, body));
    const run = await transitionProductionRun(supabase, companyId, id, "cancel", String(body.actor || "user"));
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Cancel failed.");
  }
}
