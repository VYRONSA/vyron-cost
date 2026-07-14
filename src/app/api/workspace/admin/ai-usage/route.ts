import { NextResponse } from "next/server";
import { requireActiveWorkspaceId, requireAdminSession } from "@/lib/vyron-workspace-admin-server";
import { AiUsageService } from "@/lib/platform/ai";

export const runtime = "nodejs";

function adminErrorStatus(error: unknown, fallback = 400) {
  const message = error instanceof Error ? String(error.message || "") : "";
  if (message.includes("Workspace session required") || message.includes("Access denied") || message.includes("Admin access required")) {
    return 403;
  }
  if (message.includes("No active client workspace")) return 400;
  return fallback;
}

export async function GET() {
  try {
    await requireAdminSession("admin.company");
    const workspaceId = await requireActiveWorkspaceId();
    const summary = await AiUsageService.getUsageSummaryByWorkspaceId(workspaceId);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load AI usage summary." },
      { status: adminErrorStatus(error, 500) }
    );
  }
}
