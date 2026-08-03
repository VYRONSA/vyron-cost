import { NextRequest, NextResponse } from "next/server";
import { developerApiUnauthorized, requirePlatformSessionFromRequest } from "@/lib/vyron-platform-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Company picker for the reset centre. Read-only; no supervisor password needed to list. */
export async function GET(request: NextRequest) {
  try {
    await requirePlatformSessionFromRequest(request, ["PLATFORM_ADMIN"]);
  } catch (error) {
    return developerApiUnauthorized(
      error instanceof Error ? error.message : "Developer authentication required."
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase service role is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("vyron_cost_companies")
    .select("id, name, trading_name, subscription_status, created_at")
    .order("name");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    companies: (data || []).map((c) => ({
      id: String(c.id),
      name: String(c.name || ""),
      tradingName: String(c.trading_name || ""),
      status: String(c.subscription_status || ""),
    })),
  });
}
