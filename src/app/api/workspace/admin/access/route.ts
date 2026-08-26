import { NextResponse } from "next/server";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import { hasAdminAccess } from "@/lib/vyron-workspace-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * May the signed-in member see the admin section?
 *
 * The guard around /admin used to answer this from the browser's own cookies —
 * the active-client cookie for "is there a workspace" and the session cookie's
 * role for "is it an admin". Neither is authoritative any more, so a genuine
 * owner whose active-client cookie was missing was told they had no admin
 * access and never reached the screen at all.
 *
 * getServerWorkspaceSession resolves the member against
 * vyron_workspace_memberships and takes the role from that row, so this answers
 * from the database. It is only a gate on what is worth rendering: every admin
 * route still enforces the same permission itself.
 */
export async function GET() {
  const session = await getServerWorkspaceSession();
  if (!session) {
    return NextResponse.json({ ok: true, admin: false, role: null, signedIn: false });
  }
  return NextResponse.json({
    ok: true,
    signedIn: true,
    admin: hasAdminAccess(session.role),
    role: session.role,
  });
}
