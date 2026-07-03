import { NextRequest, NextResponse } from "next/server";
import { inviteWorkspaceUser, listWorkspaceMembers, type InviteUserInput } from "@/lib/vyron-saas-workspace";
import { developerApiUnauthorized, requirePlatformSessionFromRequest } from "@/lib/vyron-platform-auth";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    await requirePlatformSessionFromRequest(_request, ["PLATFORM_ADMIN", "PLATFORM_OPERATOR", "PLATFORM_AUDITOR"]);
  } catch (error) {
    return developerApiUnauthorized(error instanceof Error ? error.message : "Developer authentication required.");
  }

  try {
    const { workspaceId } = await context.params;
    const members = await listWorkspaceMembers(workspaceId);
    return NextResponse.json({ ok: true, members });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load users." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    await requirePlatformSessionFromRequest(request, ["PLATFORM_ADMIN", "PLATFORM_OPERATOR"]);
  } catch (error) {
    return developerApiUnauthorized(error instanceof Error ? error.message : "Developer authentication required.");
  }

  try {
    const { workspaceId } = await context.params;
    const body = (await request.json()) as InviteUserInput;
    const member = await inviteWorkspaceUser(workspaceId, body);
    return NextResponse.json({ ok: true, member });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invite failed." },
      { status: 400 }
    );
  }
}
