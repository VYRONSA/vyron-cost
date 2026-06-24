import { NextRequest, NextResponse } from "next/server";
import {
  assignCustomerRole,
  assignSupplierRole,
  getVyronContactById,
  updateContactRoles,
} from "@/lib/vyron-contact-master";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  try {
    await requireWorkspacePermission("customers.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "Company not found." }, { status: 404 });

    const { id } = await context.params;
    const contact = await getVyronContactById(supabase, companyId, id);
    if (!contact) return NextResponse.json({ ok: false, error: "Contact not found." }, { status: 404 });

    return NextResponse.json({ ok: true, contact });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Contact detail failed.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("customers.edit");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;

    if (body.action === "assign-customer") {
      const contact = await assignCustomerRole(supabase, companyId, id);
      return NextResponse.json({ ok: true, contact });
    }

    if (body.action === "assign-supplier") {
      const contact = await assignSupplierRole(supabase, companyId, id);
      return NextResponse.json({ ok: true, contact });
    }

    const contact = await updateContactRoles(supabase, companyId, id, {
      is_customer: body.is_customer,
      is_supplier: body.is_supplier,
    });

    return NextResponse.json({ ok: true, contact });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Contact update failed.");
  }
}
