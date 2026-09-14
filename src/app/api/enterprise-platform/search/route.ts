import { NextResponse } from "next/server";
import { enterpriseGlobalSearch } from "@/lib/vyron-enterprise-platform-architecture";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Enterprise search over the signed-in member's own company.
 *
 * This route used to check no session and search a fixed tenant
 * (VYRON_DEFAULT_TENANT_ID) through the library default, labelling every
 * result with one customer's name whoever asked. Now: a verified session with
 * reports.view, checked before anything is revealed; the company is the one
 * the member's workspace owns, resolved on the server, and results carry that
 * company's own name. Nothing in the request chooses a tenant.
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
    // Display only, and only for the workspace in the verified session.
    const workspace = await getServerActiveWorkspace();
    const companyLabel = workspace?.companyName || workspace?.tradingName || "Your company";
    const q = new URL(req.url).searchParams.get("q") || "";
    const results = await enterpriseGlobalSearch(q, companyId, companyLabel);
    return NextResponse.json({ ok: true, results }, { headers: NO_STORE });
  } catch (error) {
    const response = workspaceAccessErrorResponse(error, "Search failed.");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
