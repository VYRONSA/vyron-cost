import { NextRequest, NextResponse } from "next/server";
import { requireAdminWorkspaceId } from "@/lib/vyron-workspace-admin-server";
import {
  getWorkspaceCompanyProfile,
  updateWorkspaceCompanyProfile,
  type UpdateCompanyProfileInput,
} from "@/lib/vyron-saas-workspace";

export const runtime = "nodejs";

/**
 * No session is 401; a session without the permission is 403.
 *
 * These were both 403, which told an unauthenticated caller their credentials
 * were rejected when in fact they had presented none. The rest of the API
 * already answers 401 in that case.
 */
function adminErrorStatus(error: unknown, fallback = 400) {
  const message = error instanceof Error ? String(error.message || "") : "";
  if (message.includes("Workspace session required")) return 401;
  if (message.includes("Access denied") || message.includes("Admin access required")) return 403;
  if (message.includes("No active client workspace")) return 400;
  return fallback;
}

/*
 * WHOSE COMPANY PROFILE THIS IS
 *
 * Both handlers resolve the workspace with requireAdminWorkspaceId, which reads
 * it from the membership-backed session. They previously used
 * requireActiveWorkspaceId, which returns whatever the vyron_cost_active_client
 * cookie names — and that cookie is written by the browser and never checked
 * against a membership. An administrator of one workspace could therefore point
 * it at another workspace's id and read or overwrite that company's tax profile,
 * because the permission check only proved they were an admin *somewhere*.
 *
 * Nothing here reads a workspace or company id from the request body or cookies.
 */
export async function GET() {
  try {
    const { workspaceId } = await requireAdminWorkspaceId("admin.company");
    const profile = await getWorkspaceCompanyProfile(workspaceId);
    return NextResponse.json({ ok: true, profile, workspaceId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load company profile." },
      { status: adminErrorStatus(error, 500) }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { workspaceId } = await requireAdminWorkspaceId("admin.company");
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
