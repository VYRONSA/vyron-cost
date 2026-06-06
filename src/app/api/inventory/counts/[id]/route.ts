import { NextRequest, NextResponse } from "next/server";
import {
  approveStockCount,
  postStockCount,
  submitStockCount,
  updateStockCountLine,
} from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const [{ data: count }, { data: lines }] = await Promise.all([
    supabase.from("vyron_cost_stock_counts").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("vyron_cost_stock_count_lines")
      .select("*, vyron_cost_stock_items(item_code, description, unit)")
      .eq("stock_count_id", id)
      .order("created_at"),
  ]);
  if (!count) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, count, lines: lines || [] });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));

  try {
    if (body.action === "updateLine" && body.lineId != null) {
      await updateStockCountLine(supabase, String(body.lineId), Number(body.countedQty));
      return NextResponse.json({ ok: true });
    }
    if (body.action === "submit") {
      await submitStockCount(supabase, id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "approve") {
      await approveStockCount(supabase, id, String(body.approvedBy || "supervisor"));
      return NextResponse.json({ ok: true });
    }
    if (body.action === "post") {
      await postStockCount(supabase, id, String(body.actor || "supervisor"));
      return NextResponse.json({ ok: true });
    }
    if (body.action === "start") {
      await supabase.from("vyron_cost_stock_counts").update({ status: "In Progress" }).eq("id", id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Update failed." }, { status: 500 });
  }
}
