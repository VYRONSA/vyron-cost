import { NextRequest, NextResponse } from "next/server";
import { getCustomerInvoice, updateCustomerInvoiceStatus } from "@/lib/vyron-customer-invoices";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const loaded = await getCustomerInvoice(supabase, id);
    if (!loaded) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true, ...loaded });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Load failed." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "approve") {
      const invoice = await updateCustomerInvoiceStatus(supabase, id, "Approved");
      return NextResponse.json({ ok: true, invoice });
    }
    if (body.action === "send") {
      const invoice = await updateCustomerInvoiceStatus(supabase, id, "Sent");
      return NextResponse.json({ ok: true, invoice });
    }
    if (body.action === "paid") {
      const invoice = await updateCustomerInvoiceStatus(supabase, id, "Paid");
      return NextResponse.json({ ok: true, invoice });
    }
    if (body.action === "cancel") {
      const invoice = await updateCustomerInvoiceStatus(supabase, id, "Cancelled");
      return NextResponse.json({ ok: true, invoice });
    }
    if (body.status) {
      const invoice = await updateCustomerInvoiceStatus(supabase, id, body.status);
      return NextResponse.json({ ok: true, invoice });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Update failed." }, { status: 500 });
  }
}
