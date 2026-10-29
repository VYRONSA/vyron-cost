import { NextRequest, NextResponse } from "next/server";
import { buildCostingLine } from "@/lib/vyron-costing-lines-server";
import {
  MasterDataInputError,
  masterDataErrorResponse,
  recordMasterDataAudit,
  requireId,
  requireMasterDataContext,
} from "@/lib/vyron-master-data-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Change one Cost Calculator line of the signed-in member's own company (boms.edit). */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { supabase, companyId, actor } = await requireMasterDataContext("boms.edit");
    const id = requireId((await context.params).id, "Costing line");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { line, recipeName } = await buildCostingLine(supabase, companyId, body);
    const { data, error } = await supabase
      .from("vyron_cost_recipe_items")
      .update(line)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new MasterDataInputError("Costing line not found.", 404);
    await recordMasterDataAudit(supabase, {
      companyId,
      eventType: "Costing Line Updated",
      entityName: recipeName,
      detail: `Line set to ${line.quantity} ${line.unit} ${line.ingredient_name_snapshot} at ${line.true_unit_cost} on "${recipeName}" by ${actor}.`,
    });
    return NextResponse.json({ ok: true, item: data[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterDataErrorResponse(error, "Could not save costing line.");
  }
}

/** Remove one Cost Calculator line of the signed-in member's own company (boms.edit). */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { supabase, companyId, actor } = await requireMasterDataContext("boms.edit");
    const id = requireId((await context.params).id, "Costing line");
    const { data, error } = await supabase
      .from("vyron_cost_recipe_items")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)
      .select("id, ingredient_name_snapshot, quantity, unit");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new MasterDataInputError("Costing line not found.", 404);
    const removed = data[0];
    await recordMasterDataAudit(supabase, {
      companyId,
      eventType: "Costing Line Removed",
      entityName: String(removed.ingredient_name_snapshot || id),
      detail: `Line ${removed.quantity} ${removed.unit} ${removed.ingredient_name_snapshot} removed by ${actor}.`,
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterDataErrorResponse(error, "Could not delete costing line.");
  }
}
