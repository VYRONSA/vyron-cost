import { NextRequest, NextResponse } from "next/server";
import { getProcurementRecommendationsForSupplier } from "@/lib/vyron-procurement-ai-data";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: supplierId } = await context.params;
  const supplierName = request.nextUrl.searchParams.get("name") || undefined;
  try {
    let name = supplierName;
    if (!name && isSupabaseServiceRoleConfigured()) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { data } = await supabase
          .from("vyron_cost_suppliers")
          .select("supplier_name")
          .eq("id", supplierId)
          .maybeSingle();
        name = data?.supplier_name ? String(data.supplier_name) : undefined;
      }
    }
    const recommendations = await getProcurementRecommendationsForSupplier(supplierId, name);
    return NextResponse.json({ ok: true, recommendations });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Load failed." },
      { status: 500 }
    );
  }
}
