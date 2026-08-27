import { NextRequest, NextResponse } from "next/server";
import { startClientImpersonation } from "@/lib/vyron-saas-workspace";
import { requirePlatformSessionFromRequest } from "@/lib/vyron-platform-auth";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import {
  buildImpersonationActiveClient,
  buildImpersonationWorkspaceSession,
} from "@/lib/vyron-workspace-impersonation";
import { applyWorkspaceAuthCookies } from "@/lib/vyron-workspace-cookies";
import { ensureWorkspaceCompanyDataAligned } from "@/lib/vyron-workspace-company-resolution";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  resolvePermissionKey,
  sessionHasPermission,
} from "@/lib/vyron-workspace-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who may repair a workspace session, and which workspace they may repair.
 *
 * This endpoint mints OWNER credentials: it calls startClientImpersonation and
 * writes workspace auth cookies for the workspace id in the request body. The
 * gate it used to sit behind opened when there was NO active-client cookie at
 * all — `if (!client) return true` — so an unauthenticated caller who knew or
 * guessed a workspace UUID could POST it with no cookies and be handed an OWNER
 * session for that tenant. Verified against the pre-fix build: such a request
 * passed the gate and reached the impersonation call.
 *
 * A caller must now be a verified member, and may only repair the workspace
 * their own session belongs to. Platform developers keep the ability to repair
 * any workspace, because switching between client workspaces is what the
 * developer console is for — but that is now proven from the session rather
 * than inferred from the absence of a cookie.
 */
async function authoriseRepair(
  request: NextRequest,
  requestedWorkspaceId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  /*
   * A platform operator may repair any workspace — that is what the developer
   * console does, and it is proven with the same platform session cookie the
   * /api/developer routes require, not inferred from a missing cookie.
   */
  try {
    await requirePlatformSessionFromRequest(request);
    return { ok: true };
  } catch {
    // Not a platform operator; fall through to the workspace-member path.
  }

  const session = await getServerWorkspaceSession();
  if (!session) {
    return { ok: false, status: 401, error: "Workspace session required." };
  }

  if (!sessionHasPermission(session, resolvePermissionKey("admin.company"))) {
    return { ok: false, status: 403, error: "Workspace repair requires company administrator access." };
  }

  const authorised = String(session.workspaceId || "").trim();
  if (!authorised || authorised !== requestedWorkspaceId) {
    return {
      ok: false,
      status: 403,
      error: "Workspace repair is limited to the workspace you are signed in to.",
    };
  }

  return { ok: true };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body.workspaceId || "").trim();

    if (!workspaceId) {
      return NextResponse.json({ ok: false, error: "workspaceId is required." }, { status: 400 });
    }

    const decision = await authoriseRepair(request, workspaceId);
    if (!decision.ok) {
      return NextResponse.json({ ok: false, error: decision.error }, { status: decision.status });
    }

    const result = await startClientImpersonation(workspaceId);
    const client = buildImpersonationActiveClient(result.workspace, {
      ownerUserId: result.ownerUserId,
      ownerEmail: result.ownerEmail,
      impersonating: true,
    });
    const session = buildImpersonationWorkspaceSession(
      result.workspace,
      result.ownerUserId,
      result.ownerEmail,
      "OWNER"
    );

    let alignment: { realigned: boolean; movedTables: string[]; reason?: string } = {
      realigned: false,
      movedTables: [],
    };
    if (client.companyId && isSupabaseServiceRoleConfigured()) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        alignment = await ensureWorkspaceCompanyDataAligned(supabase, client, client.companyId);
      }
    }

    const response = NextResponse.json({
      ok: true,
      client,
      session,
      workspace: result.workspace,
      message: `Workspace session repaired for ${client.companyName}.`,
      alignment,
      status: {
        hasActiveClientCookie: true,
        workspaceId: client.id,
        workspaceName: client.companyName,
        companyLinked: Boolean(client.companyId),
        companyId: client.companyId || null,
        xeroWorkspaceReady: Boolean(client.companyId),
      },
    });

    applyWorkspaceAuthCookies(response, client, session);
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Workspace repair failed." },
      { status: 400 }
    );
  }
}
