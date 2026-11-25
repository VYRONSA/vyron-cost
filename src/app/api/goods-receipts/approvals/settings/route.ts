import { NextRequest, NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { GrnApprovalError, setGrnApprovalRequired } from "@/lib/vyron-grn-approval";

export const runtime = "nodejs";

/** PATCH { approvalRequired: boolean } — company administrators only; audited. */
export async function PATCH(request: NextRequest) {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  try {
    const session = await requireWorkspacePermission("admin.company");
    const companyId = await requireApiCompanyId();
    const result = await setGrnApprovalRequired(supabase, companyId, body.approvalRequired === true, await memberDisplayName(supabase, session));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof GrnApprovalError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return workspaceAccessErrorResponse(error, "Could not change the GRN approval setting.");
  }
}
