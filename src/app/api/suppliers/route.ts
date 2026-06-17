import { NextRequest, NextResponse } from "next/server";
import { createSupplier, listSuppliers } from "@/lib/vyron-cost-master-data";
import { requireApiCompanyId, resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
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
    await requireWorkspacePermission("suppliers.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, suppliers: [] });
    const suppliers = await listSuppliers(supabase, companyId);
    return NextResponse.json({ ok: true, suppliers });
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
    await requireWorkspacePermission("suppliers.create");
    const companyId = await requireApiCompanyId();
    const supplier = await createSupplier(supabase, companyId, {
      supplier_name: String(body.supplier_name || ""),
      category: body.category,
      contact_email: body.contact_email,
      invoice_email: body.invoice_email,
      phone: body.phone,
      risk_status: body.risk_status,
      last_price_movement: body.last_price_movement,
      payment_terms: body.payment_terms,
      lead_time_days: body.lead_time_days,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, supplier });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create failed.");
  }
}
