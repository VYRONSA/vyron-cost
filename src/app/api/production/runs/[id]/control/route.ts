import { NextRequest, NextResponse } from "next/server";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  manufacturingCompanyContextFromRequest,
  requireManufacturingCompanyId,
} from "@/lib/vyron-manufacturing-api-context";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { ProductionControlError, updateProductionRunControl } from "@/lib/vyron-production-run-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH production control details (schedule, priority, hold, rejects, rework, downtime). Audited per field. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    const session = await requireWorkspacePermission("manufacturing.runs.create");
    const companyId = await requireManufacturingCompanyId(supabase, manufacturingCompanyContextFromRequest(request, body));
    const run = await updateProductionRunControl(supabase, companyId, id, body.control ?? {}, await memberDisplayName(supabase, session));
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    if (error instanceof ProductionControlError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return workspaceAccessErrorResponse(error, "Production control update failed.");
  }
}
