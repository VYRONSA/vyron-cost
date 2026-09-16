import { NextRequest, NextResponse } from "next/server";
import { reverseProductionRun, ManufactureReversalBlockedError } from "@/lib/vyron-manufacturing";
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
    await requireWorkspacePermission("manufacturing.runs.reverse");
    const companyId = await requireManufacturingCompanyId(supabase, manufacturingCompanyContextFromRequest(request, body));
    // A reversal reason is mandatory and never defaulted — the audit trail must
    // record WHY. Supervisor acknowledgement must be explicit, not assumed.
    const reason = String(body.reason || "").trim();
    if (!reason) {
      return NextResponse.json({ ok: false, error: "A reversal reason is required." }, { status: 400 });
    }
    if (reason.length > 500) {
      return NextResponse.json({ ok: false, error: "A reversal reason must be 500 characters or fewer." }, { status: 400 });
    }
    const run = await reverseProductionRun(supabase, companyId, id, {
      reason,
      actor: String(body.actor || "supervisor"),
      supervisor: body.supervisor === true,
    });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    if (error instanceof ManufactureReversalBlockedError) {
      // Not an auth failure — the run is intact; reversal is blocked by downstream
      // stock. Return a precise, non-destructive message the UI can show.
      return NextResponse.json({ ok: false, error: error.message, details: error.details }, { status: 409 });
    }
    return workspaceAccessErrorResponse(error, "Reverse failed.");
  }
}
