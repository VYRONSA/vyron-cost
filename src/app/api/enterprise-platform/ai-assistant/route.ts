import { NextResponse } from "next/server";
import { answerEnterpriseAi } from "@/lib/vyron-enterprise-platform-architecture";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Enterprise AI answers, built from the signed-in member's own company.
 *
 * This route used to check no session and answer from a fixed tenant
 * (VYRON_DEFAULT_TENANT_ID) through the library default, so anyone could ask
 * it about that tenant's figures and a signed-in member was answered from that
 * tenant instead of their own. Now: a verified session with reports.view — the
 * same permission as Ask VYRON — checked before the question is even read; the
 * company is the one the member's workspace owns, resolved on the server.
 * Nothing in the request, including the question, chooses a tenant.
 */
export async function POST(req: Request) {
  try {
    await requireWorkspacePermission("reports.view");
    const body = await req.json().catch(() => ({}));
    const question = String(body?.question || "").trim();
    if (!question) {
      return NextResponse.json({ ok: false, error: "question required" }, { status: 400, headers: NO_STORE });
    }
    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "No workspace is active for this session. Sign out and back in, or reopen the workspace." },
        { status: 409, headers: NO_STORE }
      );
    }
    const answer = await answerEnterpriseAi(question, companyId);
    return NextResponse.json({ ok: true, answer }, { headers: NO_STORE });
  } catch (error) {
    const response = workspaceAccessErrorResponse(error, "The assistant could not answer.");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
