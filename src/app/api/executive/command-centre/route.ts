import { NextResponse } from "next/server";
import { getExecutiveCommandCentreData } from "@/lib/vyron-executive-command-centre";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

export async function GET() {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  try {
    const data = await getExecutiveCommandCentreData(supabase, VYRON_DEFAULT_TENANT_ID);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Command centre load failed." },
      { status: 500 }
    );
  }
}
