import { NextRequest, NextResponse } from "next/server";
import { resetWorkspaceUserPassword } from "@/lib/vyron-saas-workspace";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; userId: string }> }
) {
  try {
    const { workspaceId, userId } = await context.params;
    const body = await request.json();
    const password = String(body.password || "");
    await resetWorkspaceUserPassword(workspaceId, userId, password);
    return NextResponse.json({ ok: true, message: "Password reset successfully." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Password reset failed." },
      { status: 400 }
    );
  }
}
