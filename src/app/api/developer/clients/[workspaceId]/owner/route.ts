import { NextRequest, NextResponse } from "next/server";
import { updateWorkspaceOwnerLogin, type UpdateOwnerLoginInput } from "@/lib/vyron-saas-workspace";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const body = (await request.json()) as UpdateOwnerLoginInput;
    const result = await updateWorkspaceOwnerLogin(workspaceId, body);
    return NextResponse.json({
      ok: true,
      ownerDetails: result.ownerDetails,
      ownerUserId: result.ownerUserId,
      authProvisioned: result.authProvisioned,
      message: result.message,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Owner login update failed." },
      { status: 400 }
    );
  }
}
