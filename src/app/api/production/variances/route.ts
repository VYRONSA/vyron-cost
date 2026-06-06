import { NextResponse } from "next/server";
import { getProductionVariances } from "@/lib/vyron-manufacturing";
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
    const variances = await getProductionVariances(supabase, VYRON_DEFAULT_TENANT_ID);
    return NextResponse.json({ ok: true, variances });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Load failed." }, { status: 500 });
  }
}
