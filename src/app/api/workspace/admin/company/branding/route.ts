import { NextRequest, NextResponse } from "next/server";
import { requireAdminWorkspaceId } from "@/lib/vyron-workspace-admin-server";
import { BrandingService } from "@/lib/platform/branding";
import type { BrandingUpdateInput } from "@/lib/platform/branding";

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
    const branding = await BrandingService.getBrandingByWorkspaceId(workspaceId);
    return NextResponse.json({ ok: true, branding });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load branding profile." },
      { status: adminErrorStatus(error, 500) }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { workspaceId } = await requireAdminWorkspaceId("admin.company");
    const body = (await request.json()) as BrandingUpdateInput;
    const branding = await BrandingService.updateBrandingByWorkspaceId(workspaceId, body);
    return NextResponse.json({ ok: true, branding });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update branding profile." },
      { status: adminErrorStatus(error, 400) }
    );
  }
}
