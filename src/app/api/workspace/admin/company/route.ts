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

export async function GET() {
  try {
    await requireAdminSession("admin.company");
    const client = await getServerActiveWorkspace();
    const profile = await getActiveWorkspaceCompanyProfile();
    return NextResponse.json({ ok: true, profile, workspaceId: client?.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load company profile." },
      { status: error instanceof Error && error.message.includes("required") ? 403 : 500 }
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
      { status: 400 }
    );
  }
}
