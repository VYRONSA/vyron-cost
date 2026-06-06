import { NextRequest, NextResponse } from "next/server";
import { createStockCount, listStockItems, syncStockItemsFromMasters } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

type CountType = "ingredients" | "packaging" | "finished_goods";

function normaliseCountType(value: unknown): CountType | null {
  const next = String(value || "").trim();
  if (next === "ingredients" || next === "packaging" || next === "finished_goods") return next;
  return null;
}

function entityTypeForCount(type: CountType) {
  if (type === "ingredients") return "ingredient";
  if (type === "packaging") return "packaging";
  return "finished_goods";
}

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { data, error } = await supabase
    .from("vyron_cost_stock_counts")
    .select("*")
    .eq("company_id", VYRON_DEFAULT_TENANT_ID)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, counts: data || [] });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const countType = normaliseCountType(body.countType);
  if (!countType) return NextResponse.json({ ok: false, error: "countType required." }, { status: 400 });

  try {
    let items = await listStockItems(supabase, VYRON_DEFAULT_TENANT_ID, { entityType: entityTypeForCount(countType) });

    if (items.length === 0) {
      await syncStockItemsFromMasters(supabase, VYRON_DEFAULT_TENANT_ID);
      items = await listStockItems(supabase, VYRON_DEFAULT_TENANT_ID, { entityType: entityTypeForCount(countType) });
    }

    const result = await createStockCount(supabase, VYRON_DEFAULT_TENANT_ID, countType, String(body.createdBy || "supervisor"));
    return NextResponse.json({ ok: true, ...result, stockItemsFound: items.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Create failed." }, { status: 500 });
  }
}
