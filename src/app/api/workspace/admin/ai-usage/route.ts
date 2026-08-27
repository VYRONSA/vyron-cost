import { NextResponse } from "next/server";
import { requireAdminWorkspaceId } from "@/lib/vyron-workspace-admin-server";
import { AiUsageService } from "@/lib/platform/ai";

export const runtime = "nodejs";

/** No session is 401; a session without the permission is 403. */
function adminErrorStatus(error: unknown, fallback = 400) {
  const message = error instanceof Error ? String(error.message || "") : "";
  if (message.includes("Workspace session required")) return 401;
  if (message.includes("Access denied") || message.includes("Admin access required")) return 403;
  if (message.includes("No active client workspace")) return 400;
  return fallback;
}

/*
 * The workspace comes from the membership-backed session, never from the
 * vyron_cost_active_client cookie. That cookie is written by the browser and is
 * not checked against a membership, so resolving from it let an administrator of
 * one workspace read or write another workspace's data simply by editing it —
 * requireAdminSession only proved they were an administrator somewhere.
 */
export async function GET() {
  try {
    const { workspaceId } = await requireAdminWorkspaceId("admin.company");
    const summary = await AiUsageService.getUsageSummaryByWorkspaceId(workspaceId);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load AI usage summary." },
      { status: adminErrorStatus(error, 500) }
    );
  }
}
