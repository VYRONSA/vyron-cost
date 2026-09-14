import { NextResponse } from "next/server";
import { runEnterpriseScenario, type ScenarioInput } from "@/lib/vyron-enterprise-scenarios";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
/** A percentage the model can meaningfully apply: a cut of at most 100%, a rise of at most 1000%. */
const PCT_MIN = -100;
const PCT_MAX = 1000;

function percentage(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n >= PCT_MIN && n <= PCT_MAX ? n : null;
}

function parseScenario(body: unknown): ScenarioInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const supplierPriceIncreasePct = percentage(input.supplierPriceIncreasePct);
  const packagingIncreasePct = percentage(input.packagingIncreasePct);
  const salesDecreasePct = percentage(input.salesDecreasePct);
  if (supplierPriceIncreasePct === null || packagingIncreasePct === null || salesDecreasePct === null) return null;
  return { supplierPriceIncreasePct, packagingIncreasePct, salesDecreasePct };
}

/**
 * What-if GP modelling over the signed-in member's own company.
 *
 * This route used to check no session and model a fixed tenant's leakage
 * figures through a library default, so anyone could run it. Now: a verified
 * session with reports.view, checked before the body is even read; the input
 * is validated; the company is the one the member's workspace owns, resolved on
 * the server. Nothing in the request chooses a tenant.
 */
export async function POST(req: Request) {
  try {
    await requireWorkspacePermission("reports.view");

    const input = parseScenario(await req.json().catch(() => null));
    if (!input) {
      return NextResponse.json(
        { ok: false, error: `Each percentage must be a number between ${PCT_MIN} and ${PCT_MAX}.` },
        { status: 400, headers: NO_STORE }
      );
    }

    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "No workspace is active for this session. Sign out and back in, or reopen the workspace." },
        { status: 409, headers: NO_STORE }
      );
    }

    const impact = await runEnterpriseScenario(input, companyId);
    return NextResponse.json({ ok: true, impact }, { headers: NO_STORE });
  } catch (error) {
    const response = workspaceAccessErrorResponse(error, "The scenario could not be run.");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
