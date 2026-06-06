import { NextResponse } from "next/server";
import { listVyronFinishedGoods } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

function finishedGoodStockValue(row: {
  stock_value?: number | null;
  current_stock?: number | null;
  latest_actual_cost?: number | null;
  standard_cost?: number | null;
}) {
  const explicit = Number(row.stock_value ?? 0);
  if (explicit > 0) return explicit;
  const qty = Number(row.current_stock || 0);
  const cost = Number(row.latest_actual_cost || row.standard_cost || 0);
  return Math.round(qty * cost * 100) / 100;
}

function mapStatus(raw: string | null | undefined, daysCover: number) {
  if (raw === "Low Stock" || raw === "Overstocked" || raw === "Watch" || raw === "Healthy") return raw;
  if (daysCover <= 0) return "Low Stock";
  if (daysCover < 7) return "Low Stock";
  if (daysCover > 28) return "Overstocked";
  if (daysCover < 12) return "Watch";
  return "Healthy";
}

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const rows = await listVyronFinishedGoods(supabase, VYRON_DEFAULT_TENANT_ID);
    const items = rows.map((row) => {
      const current_stock = Number(row.current_stock || 0);
      const average_unit_cost = Number(row.latest_actual_cost || row.standard_cost || 0);
      const stock_value = finishedGoodStockValue(row);
      const sales_velocity_30_days = Number(row.sales_velocity_30_days || 0);
      const days_cover =
        Number(row.days_cover || 0) ||
        (sales_velocity_30_days > 0 ? Math.round(current_stock / (sales_velocity_30_days / 30)) : 0);
      return {
        id: row.id,
        product_name: row.product_name,
        sku: row.product_code,
        current_stock,
        average_unit_cost,
        stock_value,
        last_manufactured_at: row.last_manufactured_at || "",
        sales_velocity_30_days,
        days_cover,
        status: mapStatus(row.stock_status, days_cover),
      };
    });
    const totalValue = items.reduce((sum, item) => sum + item.stock_value, 0);
    return NextResponse.json({ ok: true, items, totalValue });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Finished goods failed." }, { status: 500 });
  }
}
