import { NextResponse } from "next/server";
import { masterDataErrorResponse, recordMasterDataAudit, requireMasterDataContext } from "@/lib/vyron-master-data-server";
import { recomputeRecoveryIntelligenceV2 } from "@/lib/vyron-recovery-intelligence-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recalculate the recovery register for the signed-in member's own company
 * (recovery.manage), with the same engine the Recovery pages already run on
 * load. The "Save calculated opportunities" button used to run in the browser,
 * where this engine cannot reach the database, and then fell back to inserting
 * company-less rows into the legacy table with the public key (an insert whose
 * columns no longer match production, so it saved nothing).
 */
export async function POST() {
  try {
    const { supabase, companyId, actor } = await requireMasterDataContext("recovery.manage");
    const rows = await recomputeRecoveryIntelligenceV2(companyId);
    await recordMasterDataAudit(supabase, {
      companyId,
      eventType: "Recovery Recalculated",
      entityName: "Recovery register",
      detail: `${rows.length} recovery opportunities recalculated by ${actor}.`,
    });
    return NextResponse.json({ ok: true, count: rows.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterDataErrorResponse(error, "Could not recalculate recovery opportunities.");
  }
}
