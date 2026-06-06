import { NextRequest, NextResponse } from "next/server";
import { getCustomerStatement } from "@/lib/vyron-customer-invoices";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const customerId = request.nextUrl.searchParams.get("customerId") || undefined;
  const customerName = request.nextUrl.searchParams.get("customerName") || undefined;
  const fromDate = request.nextUrl.searchParams.get("fromDate") || undefined;
  const toDate = request.nextUrl.searchParams.get("toDate") || undefined;
  try {
    const statement = await getCustomerStatement(supabase, { customerId, customerName, fromDate, toDate });
    return NextResponse.json({ ok: true, statement });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Statement failed." }, { status: 500 });
  }
}
