import { NextRequest, NextResponse } from "next/server";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const DECISIONS = new Set(["Approved", "Rejected"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Approve or reject one pending price / GP / yield approval, in the signed-in
 * member's own company.
 *
 * The Approval Centre used to write this from the browser with the public key:
 * any row by id, any company, recorded as approved by "Current User". Now: a
 * verified session with approvals.decide; the approval must belong to the
 * member's company and still be Pending (a decision is not silently replaced);
 * "approved by" is the member. A browser-sent name is ignored.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500, headers: NO_STORE });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500, headers: NO_STORE });

  try {
    const session = await requireWorkspacePermission("approvals.decide");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const status = String(body?.status || "");
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";
    if (!DECISIONS.has(status)) {
      return NextResponse.json({ ok: false, error: "Decision must be Approved or Rejected." }, { status: 400, headers: NO_STORE });
    }
    if (!UUID.test(String(id || ""))) {
      return NextResponse.json({ ok: false, error: "Approval not found." }, { status: 404, headers: NO_STORE });
    }
    const companyId = await requireApiCompanyId();
    const decidedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("vyron_cost_approvals")
      .update({
        status,
        approved_by: await memberDisplayName(supabase, session),
        decided_at: decidedAt,
        ...(note ? { decision_note: note } : {}),
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .eq("status", "Pending")
      .select("id, status, approved_by, decided_at");
    if (error) throw new Error(error.message);
    if (!data?.length) {
      return NextResponse.json(
        { ok: false, error: "This approval was not found, or has already been decided. Reload the page." },
        { status: 404, headers: NO_STORE }
      );
    }
    return NextResponse.json({ ok: true, approval: data[0] }, { headers: NO_STORE });
  } catch (error) {
    const response = workspaceAccessErrorResponse(error, "Decision failed.");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
