import { NextRequest, NextResponse } from "next/server";
import {
  appendXeroAuditEvent,
  clearStoredConnection,
  readConnection,
  readStoredConnection,
  selectXeroOrganisation,
  writeStoredConnection,
} from "@/lib/vyron-xero-connection-store";
import { getValidXeroAccessToken, testXeroConnection } from "@/lib/vyron-xero-client";
import {
  buildXeroOAuthUrl,
  defaultXeroConnection,
  isXeroOAuthConfigured,
  getXeroRedirectUri,
} from "@/lib/vyron-xero-integration";
import { requireXeroWorkspaceContext, xeroContextFromRequest } from "@/lib/vyron-xero-api-context";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

const REQUIRED_XERO_ENV = ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI"] as const;

function missingXeroEnvVars() {
  return REQUIRED_XERO_ENV.filter((key) => !process.env[key]);
}

export async function GET(request: NextRequest) {
  const oauthReady = isXeroOAuthConfigured();
  const missingEnv = missingXeroEnvVars();

  try {
    const activeWorkspace = await getServerActiveWorkspace();
    if (!activeWorkspace?.id) {
      return NextResponse.json(
        {
          ok: false,
          hasWorkspace: false,
          companyLinked: false,
          oauthReady,
          missingEnv,
          error:
            "No active workspace. Log in to a company workspace or select a client from Developer → Clients before connecting Xero.",
        },
        { status: 400 }
      );
    }

    await requireWorkspacePermission("xero.view");
    const { workspaceId, companyId, workspace } = await requireXeroWorkspaceContext(
      xeroContextFromRequest(request)
    );
    const connection = await readConnection(workspaceId);
    const resolvedCompanyId = companyId || (await getWorkspaceCompanyId());

    return NextResponse.json({
      ok: true,
      hasWorkspace: true,
      companyLinked: Boolean(resolvedCompanyId),
      connection,
      oauthReady,
      oauthUrl: oauthReady ? buildXeroOAuthUrl(workspaceId, companyId) : null,
      redirectUri: getXeroRedirectUri(),
      workspaceName: workspace.companyName || workspace.tradingName || workspace.id,
      missingEnv,
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Connection status failed.");
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  try {
    const { workspaceId, companyId } = await requireXeroWorkspaceContext(xeroContextFromRequest(request, body));
    const actor = String(body.actor || "user");

    if (action === "disconnect") {
      await requireWorkspacePermission("xero.connect");
      await clearStoredConnection(workspaceId, actor, companyId);
      return NextResponse.json({ ok: true, connection: defaultXeroConnection() });
    }

    if (action === "select-organisation") {
      await requireWorkspacePermission("xero.connect");
      const tenantId = String(body.tenantId || body.organisationId || "").trim();
      if (!tenantId) {
        return NextResponse.json({ ok: false, error: "tenantId is required." }, { status: 400 });
      }
      const connection = await selectXeroOrganisation(workspaceId, tenantId, { actor, companyId });
      return NextResponse.json({ ok: true, connection });
    }

    if (action === "refresh-token") {
      await requireWorkspacePermission("xero.connect");
      await getValidXeroAccessToken(workspaceId, { companyId, actor });
      const connection = await readConnection(workspaceId);
      return NextResponse.json({ ok: true, connection });
    }

    if (action === "test-connection") {
      await requireWorkspacePermission("xero.view");
      const result = await testXeroConnection(workspaceId, { companyId, actor });
      const stored = await readStoredConnection(workspaceId);
      if (stored) {
        await writeStoredConnection(workspaceId, { ...stored, status: "Connected" });
      }
      const connection = await readConnection(workspaceId);
      return NextResponse.json({ ok: true, connection, test: result });
    }

    if (action === "touch-sync") {
      await requireWorkspacePermission("xero.sync");
      const current = await readStoredConnection(workspaceId);
      if (!current?.connected) {
        return NextResponse.json({ ok: false, error: "Not connected to Xero." }, { status: 400 });
      }

      const updated = { ...current, lastSyncAt: new Date().toISOString(), status: "Connected" as const };
      await writeStoredConnection(workspaceId, updated);
      await appendXeroAuditEvent(
        workspaceId,
        {
          event: "sync_completed",
          actor,
          companyId,
          detail: "Manual sync timestamp updated.",
        },
        companyId
      );
      const connection = await readConnection(workspaceId);
      return NextResponse.json({ ok: true, connection });
    }

    return NextResponse.json(
      { ok: false, error: "Use /api/integrations/xero/connect to start OAuth." },
      { status: 400 }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Connection action failed.");
  }
}
