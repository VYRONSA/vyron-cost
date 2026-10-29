import { NextRequest, NextResponse } from "next/server";
import {
  CATEGORY_STATUSES,
  CATEGORY_TYPES,
  MasterDataInputError,
  masterDataErrorResponse,
  oneOf,
  optionalText,
  recordMasterDataAudit,
  requireId,
  requireMasterDataContext,
  requiredText,
} from "@/lib/vyron-master-data-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Update one category of the signed-in member's own company (products.edit).
 * Only name, type, description and status change; the Xero account mapping
 * columns are left exactly as they are.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { supabase, companyId, actor } = await requireMasterDataContext("products.edit");
    const id = requireId((await context.params).id, "Category");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const changes = {
      category_name: requiredText(body.category_name, "Category name"),
      category_type: oneOf(body.category_type, CATEGORY_TYPES, "Category type"),
      description: optionalText(body.description, "Description", 1000),
      status: oneOf(body.status, CATEGORY_STATUSES, "Status"),
    };
    const { data: before, error: loadError } = await supabase
      .from("vyron_cost_categories")
      .select("id, category_name")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!before) throw new MasterDataInputError("Category not found.", 404);
    const { data, error } = await supabase
      .from("vyron_cost_categories")
      .update(changes)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message || "Could not update category.");
    const renamed = String(before.category_name || "") !== changes.category_name;
    await recordMasterDataAudit(supabase, {
      companyId,
      eventType: "Category Updated",
      entityName: changes.category_name,
      detail: renamed
        ? `Category "${before.category_name}" renamed to "${changes.category_name}" by ${actor}.`
        : `Category "${changes.category_name}" updated by ${actor}.`,
    });
    return NextResponse.json({ ok: true, category: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterDataErrorResponse(error, "Could not update category.");
  }
}

/** Delete one category of the signed-in member's own company (products.delete). */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { supabase, companyId, actor } = await requireMasterDataContext("products.delete");
    const id = requireId((await context.params).id, "Category");
    const { data, error } = await supabase
      .from("vyron_cost_categories")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)
      .select("id, category_name");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new MasterDataInputError("Category not found.", 404);
    const name = String(data[0].category_name || id);
    await recordMasterDataAudit(supabase, {
      companyId,
      eventType: "Category Deleted",
      entityName: name,
      detail: `Category "${name}" deleted by ${actor}.`,
      riskLevel: "Medium",
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterDataErrorResponse(error, "Could not delete category.");
  }
}
