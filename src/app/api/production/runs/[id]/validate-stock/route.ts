import { NextRequest, NextResponse } from "next/server";
import { validateProductionStock } from "@/lib/vyron-manufacturing";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const { id } = await context.params;
  try {
    const { ok: stockOk, shortages } = await validateProductionStock(supabase, VYRON_DEFAULT_TENANT_ID, id);
    return NextResponse.json({ ok: true, stockOk, shortages });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Validation failed." }, { status: 500 });
  }
}
