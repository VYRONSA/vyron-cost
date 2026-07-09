import { NextRequest, NextResponse } from "next/server";
import {
  countWorkspaceUsers,
  getWorkspaceUserLimit,
  requireActiveWorkspaceId,
  requireAdminSession,
} from "@/lib/vyron-workspace-admin-server";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
import {
  defaultPermissionsForRole,
  normalizePermissionMap,
} from "@/lib/vyron-workspace-permissions";
import {
  ensureMemoryWorkspace,
  inviteWorkspaceUser,
  listWorkspaceMembers,
  type InviteUserInput,
  type WorkspaceRole,
} from "@/lib/vyron-saas-workspace";

export const runtime = "nodejs";

function adminErrorStatus(error: unknown, fallback = 500) {
  const message = error instanceof Error ? String(error.message || "") : "";
  if (message.includes("Workspace session required") || message.includes("Access denied") || message.includes("Admin access required")) {
    return 403;
  }
  if (message.includes("No active client workspace")) return 400;
  return fallback;
}

function ownerFallbackMember(session: Awaited<ReturnType<typeof requireAdminSession>>) {
  return {
    membershipId: `owner-${session.userId}`,
    userId: session.userId,
    email: session.email,
    firstName: session.firstName,
    surname: session.surname,
    mobile: "",
    role: "OWNER" as WorkspaceRole,
    status: "Active" as const,
    joinedAt: new Date().toISOString(),
    permissions: session.permissions,
  };
}

export async function GET() {
  try {
    const session = await requireAdminSession();
    const workspaceId = await requireActiveWorkspaceId();
    const client = await getServerActiveWorkspace();
    if (client) {
      ensureMemoryWorkspace({
        id: client.id,
        companyName: client.companyName,
        tradingName: client.tradingName,
        packageName: client.packageName,
        status: client.status === "Active" ? "Live" : (client.status as "Demo" | "Setup" | "Suspended"),
        userLimit: client.userLimit ?? 5,
        contactEmail: client.contactEmail,
        phone: client.phone,
        ownerUserId: client.ownerUserId,
      });
    }

    let members = await listWorkspaceMembers(workspaceId);
    if (!members.length) members = [ownerFallbackMember(session)];

    const [userLimit, activeUsers] = await Promise.all([
      getWorkspaceUserLimit(workspaceId),
      countWorkspaceUsers(workspaceId),
    ]);

    return NextResponse.json({
      ok: true,
      members,
      userLimit,
      activeUsers: activeUsers || members.filter((member) => member.status !== "Disabled").length,
      canCreateUser: (activeUsers || members.length) < userLimit,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load users." },
      { status: adminErrorStatus(error, 500) }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();
    const workspaceId = await requireActiveWorkspaceId();
    const body = (await request.json()) as InviteUserInput & { confirmPassword?: string };

    if (body.method === "password") {
      if (!body.password || body.password.length < 8) {
        return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
      }
      if (body.password !== body.confirmPassword) {
        return NextResponse.json({ ok: false, error: "Passwords do not match." }, { status: 400 });
      }
    }

    const userLimit = await getWorkspaceUserLimit(workspaceId);
    const activeUsers = await countWorkspaceUsers(workspaceId);
    if (activeUsers >= userLimit) {
      return NextResponse.json(
        {
          ok: false,
          error: "User limit reached for this package. Upgrade package to add more users.",
        },
        { status: 400 }
      );
    }

    const member = await inviteWorkspaceUser(workspaceId, {
      firstName: body.firstName,
      surname: body.surname,
      email: body.email,
      mobile: body.mobile,
      role: body.role,
      method: body.method,
      password: body.password,
      permissions: normalizePermissionMap(
        body.permissions || defaultPermissionsForRole(body.role)
      ),
    });

    return NextResponse.json({ ok: true, member });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "User creation failed." },
      { status: adminErrorStatus(error, 400) }
    );
  }
}
