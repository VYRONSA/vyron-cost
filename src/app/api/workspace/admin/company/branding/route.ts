import { NextRequest, NextResponse } from "next/server";
import { requireActiveWorkspaceId, requireAdminSession } from "@/lib/vyron-workspace-admin-server";
import { BrandingService } from "@/lib/platform/branding";
import type { BrandingUpdateInput } from "@/lib/platform/branding";

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
    await requireAdminSession("admin.company");
    const workspaceId = await requireActiveWorkspaceId();
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
