import { NextRequest, NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { memberDisplayName, sessionAuditActor } from "@/lib/vyron-audit-actor";
import {
  BOM_OVERRIDE_PERMISSION,
  BomOverrideError,
  createBomCompletenessOverride,
  removeBomCompletenessOverride,
} from "@/lib/vyron-bom-completeness-overrides";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

/**
 * BOM Completeness — Override BOM Completeness / Remove Override.
 *
 * Permission boms.completeness_override, company from the verified session,
 * actor from the signed session (never the body). The classification is
 * re-derived on the server before an override is recorded.
 */
async function handle(request: NextRequest, mode: "create" | "remove") {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500, headers: noStore });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500, headers: noStore });
  const body = await request.json().catch(() => ({}));
  try {
    const session = await requireWorkspacePermission(BOM_OVERRIDE_PERMISSION);
    const companyId = await requireApiCompanyId();
    const actor = { id: sessionAuditActor(session), name: await memberDisplayName(supabase, session) };
    const result =
      mode === "create"
        ? await createBomCompletenessOverride(supabase, companyId, actor, { productId: body.productId, reason: body.reason })
        : await removeBomCompletenessOverride(supabase, companyId, actor, { overrideId: body.overrideId, reason: body.reason });
    return NextResponse.json({ ok: true, result }, { headers: noStore });
  } catch (error) {
    if (error instanceof BomOverrideError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers: noStore });
    }
    return workspaceAccessErrorResponse(error, mode === "create" ? "Override failed." : "Override removal failed.");
  }
}

export async function POST(request: NextRequest) {
  return handle(request, "create");
}

export async function DELETE(request: NextRequest) {
  return handle(request, "remove");
}
