import { NextResponse } from "next/server";
import { auditorGlobalSearch } from "@/lib/vyron-enterprise-platform";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Auditor search over the signed-in member's own company: supplier invoices,
 * purchase orders, GRNs and stock counts.
 *
 * This route used to check no session and search a fixed tenant
 * (VYRON_DEFAULT_TENANT_ID) through the library default, so anyone could read
 * those records and a signed-in member searched that tenant instead of their
 * own. Now: a verified session with reports.view, checked before anything is
 * revealed; the company is the one the member's workspace owns, resolved on the
 * server. Nothing in the request chooses a tenant.
 */
export async function GET(req: Request) {
  try {
    await requireWorkspacePermission("reports.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "No workspace is active for this session. Sign out and back in, or reopen the workspace." },
        { status: 409, headers: NO_STORE }
      );
    }
    const q = new URL(req.url).searchParams.get("q") || "";
    const results = await auditorGlobalSearch(q, companyId);
    return NextResponse.json({ ok: true, results }, { headers: NO_STORE });
  } catch (error) {
    const response = workspaceAccessErrorResponse(error, "Search failed.");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
