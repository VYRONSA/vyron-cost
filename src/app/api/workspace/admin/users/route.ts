import { NextRequest, NextResponse } from "next/server";
import {
  countWorkspaceUsers,
  getWorkspaceUserLimit,
  requireAdminWorkspaceId,
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
  updateWorkspaceMember,
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

function ownerFallbackMember(session: Awaited<ReturnType<typeof requireAdminWorkspaceId>>["session"]) {
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
    const { session, workspaceId } = await requireAdminWorkspaceId();
    const client = await getServerActiveWorkspace();
    if (client && client.id === workspaceId) {
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
    // Workspace comes from the verified membership, never from the request.
    const { workspaceId } = await requireAdminWorkspaceId();
    const body = (await request.json()) as InviteUserInput & { confirmPassword?: string; status?: "Active" | "Disabled" };

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

    /*
     * A user asked to start disabled is disabled through the same function the
     * Enable/Disable control uses — there is no second status mechanism. The
     * account exists either way, so a failure here is reported as what it is
     * rather than swallowed into a success.
     */
    if (body.status === "Disabled") {
      try {
        const disabled = await updateWorkspaceMember(workspaceId, member.userId, { status: "Disabled" });
        return NextResponse.json({ ok: true, member: disabled });
      } catch (statusError) {
        return NextResponse.json(
          {
            ok: false,
            error: `${member.email} was created but could not be set to Disabled: ${
              statusError instanceof Error ? statusError.message : "unknown error"
            }. Set their status from the user list.`,
            member,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, member });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "User creation failed." },
      { status: adminErrorStatus(error, 400) }
    );
  }
}
