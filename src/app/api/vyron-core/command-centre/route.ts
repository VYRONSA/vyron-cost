import { NextResponse } from "next/server";
import { getVyronCoreCommandCentreData } from "@/lib/vyron-workforce-digital-twin";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";

export const runtime = "nodejs";

export async function GET() {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  try {
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, data: null });
    const data = await getVyronCoreCommandCentreData(supabase, companyId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "VYRON CORE command centre load failed." },
      { status: 500 }
    );
  }
}
