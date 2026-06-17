import { NextRequest, NextResponse } from "next/server";
import { createCustomerInvoice, listCustomerInvoices } from "@/lib/vyron-customer-invoices";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
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
    await requireWorkspacePermission("invoices.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, invoices: [] });
    const invoices = await listCustomerInvoices(supabase, companyId);
    return NextResponse.json({ ok: true, invoices });
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
    await requireWorkspacePermission("invoices.create");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });
    const invoice = await createCustomerInvoice(supabase, companyId, {
      customerId: body.customerId || null,
      customerName: String(body.customerName || "Customer"),
      invoiceNumber: body.invoiceNumber || undefined,
      invoiceDate: body.invoiceDate || undefined,
      dueDate: body.dueDate || body.due_date || undefined,
      notes: body.notes || undefined,
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create failed.");
  }
}
