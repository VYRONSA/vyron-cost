import { NextRequest, NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { memberDisplayName, sessionAuditActor } from "@/lib/vyron-audit-actor";
import { sessionHasPermission } from "@/lib/vyron-workspace-permissions";
import {
  approveGoodsReceipt,
  bulkApproveGoodsReceipts,
  getGrnApprovalSetting,
  GrnApprovalError,
  listPendingGrnApprovals,
  rejectGoodsReceipt,
} from "@/lib/vyron-grn-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

function admin() {
  return isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
}

/** Pending GRN approvals for the dashboard. */
export async function GET() {
  const supabase = admin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500, headers: noStore });
  try {
    const session = await requireWorkspacePermission("goods_receipts.view");
    const companyId = await requireApiCompanyId();
    const [setting, pending] = await Promise.all([
      getGrnApprovalSetting(supabase, companyId),
      listPendingGrnApprovals(supabase, companyId, sessionAuditActor(session)),
    ]);
    return NextResponse.json(
      {
        ok: true,
        setting,
        pending,
        canApprove: sessionHasPermission(session, "goods_receipts.approve"),
        canConfigure: sessionHasPermission(session, "admin.company"),
      },
      { headers: noStore }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Could not load GRN approvals.");
  }
}

/**
 * POST { action: "approve", ids: string[], acknowledgeExceptions?: boolean }
 *   One id + acknowledgeExceptions: individual approval of a GRN with reviewed exceptions.
 *   Several ids: bulk approval — exceptions are never acknowledged in bulk.
 * POST { action: "reject", id, reason }
 * Every result is per GRN; nothing is reported successful that was not.
 */
export async function POST(request: NextRequest) {
  const supabase = admin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500, headers: noStore });
  const body = await request.json().catch(() => ({}));
  try {
    const session = await requireWorkspacePermission("goods_receipts.approve");
    const companyId = await requireApiCompanyId();
    const approver = { userId: sessionAuditActor(session), name: await memberDisplayName(supabase, session) };

    if (body.action === "reject") {
      const result = await rejectGoodsReceipt(supabase, companyId, String(body.id || ""), approver, String(body.reason || ""));
      return NextResponse.json({ ok: true, succeeded: [result], failed: [] }, { headers: noStore });
    }
    if (body.action !== "approve") return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400, headers: noStore });

    const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (!ids.length) return NextResponse.json({ ok: false, error: "Select at least one GRN." }, { status: 400, headers: noStore });

    if (ids.length === 1) {
      try {
        const result = await approveGoodsReceipt(supabase, companyId, ids[0], approver, {
          acknowledgeExceptions: body.acknowledgeExceptions === true,
          note: body.note ? String(body.note).slice(0, 500) : undefined,
        });
        return NextResponse.json({ ok: true, succeeded: [result], failed: [] }, { headers: noStore });
      } catch (err) {
        if (err instanceof GrnApprovalError) {
          return NextResponse.json(
            { ok: true, succeeded: [], failed: [{ id: ids[0], grnNumber: null, ok: false, error: err.message }] },
            { headers: noStore }
          );
        }
        throw err;
      }
    }
    const result = await bulkApproveGoodsReceipts(supabase, companyId, ids, approver);
    return NextResponse.json({ ok: true, ...result }, { headers: noStore });
  } catch (error) {
    if (error instanceof GrnApprovalError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers: noStore });
    return workspaceAccessErrorResponse(error, "GRN approval failed.");
  }
}
