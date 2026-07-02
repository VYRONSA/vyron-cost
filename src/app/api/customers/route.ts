import { NextRequest, NextResponse } from "next/server";
import { createCustomer, listCustomersWithHistory } from "@/lib/vyron-customer-invoices";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("customers.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, customers: [] });
    const customers = await listCustomersWithHistory(supabase, companyId);
    return NextResponse.json({ ok: true, customers });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List failed.");
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("customers.create");
    const companyId = await requireApiCompanyId();
    const customer = await createCustomer(supabase, companyId, {
      customerName: String(body.customerName || body.name || ""),
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
    return workspaceAccessErrorResponse(error, "Create failed.");
  }
}
