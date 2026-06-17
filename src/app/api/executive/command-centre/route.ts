import { NextResponse } from "next/server";
import { getExecutiveCommandCentreData } from "@/lib/vyron-executive-command-centre";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";

export const runtime = "nodejs";

export async function GET() {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  try {
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, data: null });
    const data = await getExecutiveCommandCentreData(supabase, companyId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Command centre load failed." },
      { status: 500 }
    );
  }
}
