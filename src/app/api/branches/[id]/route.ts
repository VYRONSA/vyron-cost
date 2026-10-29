import { NextRequest, NextResponse } from "next/server";
import {
  MasterDataInputError,
  masterDataErrorResponse,
  recordMasterDataAudit,
  requireId,
  requireMasterDataContext,
} from "@/lib/vyron-master-data-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delete one branch of the signed-in member's own company (admin.company). The
 * Branch Manager used to delete any branch by id, in any company, from the browser.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, companyId, actor } = await requireMasterDataContext("admin.company");
    const id = requireId((await context.params).id, "Branch");
    const { data, error } = await supabase
      .from("vyron_branches")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)
      .select("id, branch_name");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new MasterDataInputError("Branch not found.", 404);
    const name = String(data[0].branch_name || id);
    await recordMasterDataAudit(supabase, {
      companyId,
      eventType: "Branch Deleted",
      entityName: name,
      detail: `Branch "${name}" deleted by ${actor}.`,
      riskLevel: "Medium",
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterDataErrorResponse(error, "Could not delete branch.");
  }
}
