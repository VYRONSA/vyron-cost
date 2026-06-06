import { NextResponse } from "next/server";
import { listCustomersWithHistory } from "@/lib/vyron-customer-invoices";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const customers = await listCustomersWithHistory(supabase);
    return NextResponse.json({ ok: true, customers });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "List failed." }, { status: 500 });
  }
}
