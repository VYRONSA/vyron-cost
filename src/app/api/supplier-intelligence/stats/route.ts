import { NextResponse } from "next/server";
import { getSupplierIntelligenceCentreStats } from "@/lib/vyron-supplier-intelligence-centre";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export async function GET() {
  try {
    await requireWorkspacePermission("suppliers.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json({
        ok: true,
        stats: {
          totalSuppliers: 0,
          activeSuppliers: 0,
          highRiskSuppliers: 0,
          inflationAlerts: 0,
          openVariances: 0,
          savingsOpportunities: 0,
        },
      });
    }
    const stats = await getSupplierIntelligenceCentreStats(companyId);
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    return workspaceAccessErrorResponse(e, "Failed.");
  }
}
