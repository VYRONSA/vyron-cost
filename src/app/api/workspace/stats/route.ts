import { NextResponse } from "next/server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { getWorkspaceDashboardStats } from "@/lib/vyron-workspace-stats";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({
      ok: true,
      stats: {
        suppliers: 0,
        ingredients: 0,
        products: 0,
        inventoryValue: 0,
        customerInvoices: 0,
        xeroStatus: "Not Connected",
      },
    });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  try {
    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json({
        ok: true,
        stats: {
          suppliers: 0,
          ingredients: 0,
          products: 0,
          inventoryValue: 0,
          customerInvoices: 0,
          xeroStatus: "Not Connected",
        },
      });
    }

    const stats = await getWorkspaceDashboardStats(supabase, companyId);
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Stats failed." },
      { status: 500 }
    );
  }
}
