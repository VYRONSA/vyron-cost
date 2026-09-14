import { NextResponse } from "next/server";
import { answerVyronCopilot } from "@/lib/vyron-autonomous-business-intelligence";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_QUESTION_LENGTH = 2000;

/**
 * Business-intelligence copilot for the signed-in member's own company.
 *
 * Answering also records a business-health snapshot for the company, so this
 * route writes. It used to check no session or permission: any signed-in
 * member, whatever their rights, wrote a snapshot on every question. Now: a
 * verified session with reports.view — the same permission as Ask VYRON —
 * checked before the body is read; the question is validated; the company is
 * the one the member's workspace owns, resolved on the server, and it is the
 * only company the snapshot can be written to.
 */
export async function POST(req: Request) {
  try {
    await requireWorkspacePermission("reports.view");

    const body = await req.json().catch(() => null);
    const raw = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).question : undefined;
    const question = typeof raw === "string" ? raw.trim() : "";
    if (!question) {
      return NextResponse.json({ ok: false, error: "question required" }, { status: 400, headers: NO_STORE });
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `Questions are limited to ${MAX_QUESTION_LENGTH} characters.` },
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

    const answer = await answerVyronCopilot(question, companyId);
    return NextResponse.json({ ok: true, answer }, { headers: NO_STORE });
  } catch (error) {
    const response = workspaceAccessErrorResponse(error, "The copilot could not answer.");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
