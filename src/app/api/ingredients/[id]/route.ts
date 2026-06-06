import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id: ingredientId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const ingredientName = String(body?.ingredientName || "").trim();
  if (!ingredientName) {
    return NextResponse.json({ ok: false, error: "Ingredient name is required." }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("vyron_cost_ingredients")
    .select("id, ingredient_name")
    .eq("id", ingredientId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: false, error: "Ingredient not found." }, { status: 404 });

  const { error: updateError } = await supabase
    .from("vyron_cost_ingredients")
    .update({ ingredient_name: ingredientName })
    .eq("id", ingredientId);
  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });

  await supabase
    .from("vyron_document_line_items")
    .update({ matched_entity_name: ingredientName })
    .eq("matched_entity_type", "ingredient")
    .eq("matched_entity_id", ingredientId);

  await supabase
    .from("vyron_supplier_line_item_mappings")
    .update({ entity_name: ingredientName })
    .eq("entity_type", "ingredient")
    .eq("entity_id", ingredientId);

  return NextResponse.json({
    ok: true,
    ingredientId,
    ingredientName,
    message: "Ingredient name updated.",
  });
}
