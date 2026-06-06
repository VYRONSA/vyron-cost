import { NextRequest, NextResponse } from "next/server";
import { createCustomerInvoice, listCustomerInvoices } from "@/lib/vyron-customer-invoices";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const invoices = await listCustomerInvoices(supabase, VYRON_DEFAULT_TENANT_ID);
    return NextResponse.json({ ok: true, invoices });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "List failed." }, { status: 500 });
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
    const invoice = await createCustomerInvoice(supabase, VYRON_DEFAULT_TENANT_ID, {
      customerId: body.customerId || null,
      customerName: String(body.customerName || "Customer"),
      invoiceNumber: body.invoiceNumber || undefined,
      invoiceDate: body.invoiceDate || undefined,
      notes: body.notes || undefined,
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Create failed." }, { status: 500 });
  }
}
