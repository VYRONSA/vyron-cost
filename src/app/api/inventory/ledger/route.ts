import { NextRequest, NextResponse } from "next/server";
import { getStockLedger } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const stockItemId = request.nextUrl.searchParams.get("stockItemId") || undefined;
  try {
    const entries = await getStockLedger(supabase, VYRON_DEFAULT_TENANT_ID, { stockItemId });
    return NextResponse.json({ ok: true, entries });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Ledger failed." }, { status: 500 });
  }
}
