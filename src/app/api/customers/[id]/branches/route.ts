import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import {
  BranchCodeInUseError,
  createCustomerBranch,
  CustomerNotInWorkspaceError,
  listCustomerBranches,
} from "@/lib/vyron-customer-branches";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * A customer's branches.
 *
 * The customer id in the path is a request, not an authorisation: the company
 * comes from the verified workspace and every query is scoped to it, so a
 * customer belonging to another tenant simply has no branches to show and none
 * can be added to it.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("customers.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, branches: [] });

    const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "1";
    const branches = await listCustomerBranches(supabase, companyId, id, { activeOnly });
    return NextResponse.json({ ok: true, branches });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Could not load branches.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("customers.edit");
    const companyId = await requireApiCompanyId();
    const branch = await createCustomerBranch(supabase, companyId, id, body);
    return NextResponse.json({ ok: true, branch });
  } catch (error) {
    if (error instanceof BranchCodeInUseError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    // A customer belonging to another workspace is simply not found here.
    if (error instanceof CustomerNotInWorkspaceError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }
    return workspaceAccessErrorResponse(error, "Could not create the branch.");
  }
}
