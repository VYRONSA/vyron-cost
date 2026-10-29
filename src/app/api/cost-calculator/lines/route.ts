import { NextRequest, NextResponse } from "next/server";
import { buildCostingLine } from "@/lib/vyron-costing-lines-server";
import { masterDataErrorResponse, recordMasterDataAudit, requireMasterDataContext } from "@/lib/vyron-master-data-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Add a Cost Calculator line to a recipe of the signed-in member's own company
 * (boms.edit). The screen used to insert from the browser with the public key.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, companyId, actor } = await requireMasterDataContext("boms.edit");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { line, recipeName } = await buildCostingLine(supabase, companyId, body);
    const { data, error } = await supabase.from("vyron_cost_recipe_items").insert(line).select("*").single();
    if (error || !data) throw new Error(error?.message || "Could not add recipe line.");
    await recordMasterDataAudit(supabase, {
      companyId,
      eventType: "Costing Line Added",
      entityName: recipeName,
      detail: `${line.quantity} ${line.unit} ${line.ingredient_name_snapshot} at ${line.true_unit_cost} added to "${recipeName}" by ${actor}.`,
    });
    return NextResponse.json({ ok: true, item: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterDataErrorResponse(error, "Could not add recipe line.");
  }
}
