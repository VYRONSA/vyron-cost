import { NextRequest, NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { JobCardError, setJobCardStatus } from "@/lib/vyron-job-cards";

export const runtime = "nodejs";

/** PATCH { status } — production status of a job card (audited). Never changes the order. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const session = await requireWorkspacePermission("manufacturing.runs.start");
    const companyId = await requireApiCompanyId();
    const card = await setJobCardStatus(supabase, companyId, id, String(body.status || ""), await memberDisplayName(supabase, session));
    return NextResponse.json({ ok: true, card });
  } catch (error) {
    if (error instanceof JobCardError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return workspaceAccessErrorResponse(error, "Could not update the job card.");
  }
}
