import { NextResponse } from "next/server";
import { getSupplierIntelligenceProfile } from "@/lib/vyron-supplier-intelligence-centre";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireWorkspacePermission("suppliers.view");
  } catch (e) {
    return workspaceAccessErrorResponse(e, "Failed.");
  }

  try {
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, profile: null });
    const profile = await getSupplierIntelligenceProfile(id, companyId);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
