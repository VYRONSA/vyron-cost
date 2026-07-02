import { NextRequest, NextResponse } from "next/server";
import { deleteCustomer, getCustomerById, updateCustomer } from "@/lib/vyron-customer-invoices";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;

  try {
    await requireWorkspacePermission("customers.view");
    const companyId = await requireApiCompanyId();
    const customer = await getCustomerById(supabase, companyId, id);
    if (!customer) return NextResponse.json({ ok: false, error: "Customer not found." }, { status: 404 });
    return NextResponse.json({ ok: true, customer });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load failed.");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("customers.edit");
    const companyId = await requireApiCompanyId();
    const customer = await updateCustomer(supabase, companyId, id, {
      customerName: body.customerName,
      category: body.category,
      contactEmail: body.contactEmail,
      invoiceEmail: body.invoiceEmail,
      phone: body.phone,
      terms: body.terms,
      vatNumber: body.vatNumber,
      status: body.status,
      creditLimit: body.creditLimit != null ? Number(body.creditLimit) : undefined,
      onHold: body.onHold != null ? Boolean(body.onHold) : undefined,
    });
    return NextResponse.json({ ok: true, customer });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update failed.");
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;

  try {
    await requireWorkspacePermission("customers.delete");
    const companyId = await requireApiCompanyId();
    const result = await deleteCustomer(supabase, companyId, id);
    return NextResponse.json({
      ok: true,
      archived: result.archived,
      customer: "customer" in result ? result.customer : undefined,
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete failed.");
  }
}
