import { NextRequest, NextResponse } from "next/server";
import {
  getActiveWorkspaceCompanyProfile,
  requireActiveWorkspaceId,
  requireAdminSession,
} from "@/lib/vyron-workspace-admin-server";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
import {
  updateWorkspaceCompanyProfile,
  type UpdateCompanyProfileInput,
} from "@/lib/vyron-saas-workspace";

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
    const client = await getServerActiveWorkspace();
    const profile = await getActiveWorkspaceCompanyProfile();
    return NextResponse.json({ ok: true, profile, workspaceId: client?.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load company profile." },
      { status: adminErrorStatus(error, 500) }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdminSession("admin.company");
    const workspaceId = await requireActiveWorkspaceId();
    const body = (await request.json()) as UpdateCompanyProfileInput;
    const profile = await updateWorkspaceCompanyProfile(workspaceId, body);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update company profile." },
      { status: adminErrorStatus(error, 400) }
    );
  }
}
