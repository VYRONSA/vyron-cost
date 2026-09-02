import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import {
  BranchCodeInUseError,
  getCustomerBranch,
  updateCustomerBranch,
} from "@/lib/vyron-customer-branches";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; branchId: string }> };

/**
 * Edit a branch, or deactivate and reactivate it.
 *
 * There is no delete. A branch that has invoiced is part of the record of what
 * happened; it stops being offered for new work and stays where it is. The
 * database enforces the same thing through ON DELETE RESTRICT.
 *
 * The branch is confirmed to belong to both this company and the customer named
 * in the path before anything changes.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id, branchId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("customers.edit");
    const companyId = await requireApiCompanyId();

    const existing = await getCustomerBranch(supabase, companyId, branchId);
    if (!existing) return NextResponse.json({ ok: false, error: "Branch not found." }, { status: 404 });
    if (existing.customer_id !== id) {
      return NextResponse.json({ ok: false, error: "That branch belongs to a different customer." }, { status: 403 });
    }

    const branch = await updateCustomerBranch(supabase, companyId, branchId, body);
    return NextResponse.json({ ok: true, branch });
  } catch (error) {
    if (error instanceof BranchCodeInUseError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return workspaceAccessErrorResponse(error, "Could not save the branch.");
  }
}
