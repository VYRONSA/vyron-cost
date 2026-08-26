import { NextRequest, NextResponse } from "next/server";
import { requireAdminWorkspaceId } from "@/lib/vyron-workspace-admin-server";
import { resetWorkspaceUserPassword } from "@/lib/vyron-saas-workspace";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { workspaceId } = await requireAdminWorkspaceId();
    const { userId } = await context.params;
    const body = (await request.json()) as { password: string; confirmPassword?: string };
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (body.confirmPassword && body.password !== body.confirmPassword) {
      return NextResponse.json({ ok: false, error: "Passwords do not match." }, { status: 400 });
    }
    await resetWorkspaceUserPassword(workspaceId, userId, body.password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Password reset failed." },
      { status: 400 }
    );
  }
}
