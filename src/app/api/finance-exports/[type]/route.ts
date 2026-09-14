import { NextResponse } from "next/server";
import { fetchFinanceExportRows, FINANCE_EXPORT_TYPES, type FinanceExportType } from "@/lib/vyron-finance-exports";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set<string>(FINANCE_EXPORT_TYPES);
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Accounting exports, for the signed-in member's own company.
 *
 * This route used to check no session at all and read a fixed tenant,
 * VYRON_DEFAULT_TENANT_ID, so anyone could download up to 500 rows per export
 * for whichever company that id named, and a signed-in member was served that
 * company's data rather than their own.
 *
 * Now: a verified session with reports.export, checked before anything about
 * the export is revealed; the company is the one the member's workspace owns,
 * resolved on the server. Nothing in the request can choose a tenant — a
 * company hint that disagrees with the session gets no company, not another
 * one.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    await requireWorkspacePermission("reports.export");

    const { type } = await params;
    if (!VALID.has(type)) {
      return NextResponse.json({ ok: false, error: "Unknown export type" }, { status: 400, headers: NO_STORE });
    }

    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "No workspace is active for this session. Sign out and back in, or reopen the workspace." },
        { status: 409, headers: NO_STORE }
      );
    }

    const rows = await fetchFinanceExportRows(type as FinanceExportType, companyId);
    return NextResponse.json({ ok: true, rows }, { headers: NO_STORE });
  } catch (error) {
    const response = workspaceAccessErrorResponse(error, "Export failed.");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
