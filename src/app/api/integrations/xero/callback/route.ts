import { NextRequest, NextResponse } from "next/server";
import {
  appendXeroAuditEvent,
  clearStoredConnection,
  writeStoredConnection,
} from "@/lib/vyron-xero-connection-store";
import { requireWorkspacePermission } from "@/lib/vyron-workspace-access";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import {
  decodeXeroOAuthState,
  exchangeXeroAuthorizationCode,
  extractXeroConnectedUser,
  isXeroOAuthConfigured,
  listXeroTenantConnections,
  mapXeroTenantsToOrganisationOptions,
  type XeroStoredConnection,
} from "@/lib/vyron-xero-integration";

export const runtime = "nodejs";

function xeroRedirect(appUrl: string, params: Record<string, string>) {
  const url = new URL("/integrations/xero", appUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");

  const decodedState = state ? decodeXeroOAuthState(state) : null;
  const activeWorkspace = await getServerActiveWorkspace();
  const workspaceId = activeWorkspace?.id || null;
  const companyId = workspaceId ? await getWorkspaceCompanyId() : null;

  if (oauthError) {
    if (workspaceId && decodedState?.workspaceId === workspaceId) {
      await clearStoredConnection(workspaceId, "user", companyId);
    }
    return xeroRedirect(appUrl, {
      xero: "error",
      message: `Xero authorization was declined or failed (${oauthError}).`,
    });
  }

  if (!code || !state) {
    return xeroRedirect(appUrl, {
      xero: "error",
      message: "Missing Xero authorization code.",
    });
  }

  if (!workspaceId || !companyId) {
    return xeroRedirect(appUrl, {
      xero: "error",
      message: "No active workspace. Select a client workspace before connecting Xero.",
    });
  }

  if (!decodedState || decodedState.workspaceId !== workspaceId) {
    await clearStoredConnection(workspaceId, "user", companyId);
    return xeroRedirect(appUrl, {
      xero: "error",
      message: "Xero OAuth workspace mismatch. Connect again from the active workspace.",
    });
  }

  if (decodedState.companyId && decodedState.companyId !== companyId) {
    await clearStoredConnection(workspaceId, "user", companyId);
    return xeroRedirect(appUrl, {
      xero: "error",
      message: "Xero OAuth company mismatch. Connect again from the active workspace.",
    });
  }

  if (!isXeroOAuthConfigured()) {
    await clearStoredConnection(workspaceId, "user", companyId);
    return xeroRedirect(appUrl, {
      xero: "error",
      message: "Xero OAuth is not configured on the server.",
    });
  }

  try {
    await requireWorkspacePermission("xero.connect");
    const tokenResponse = await exchangeXeroAuthorizationCode(code);
    const tenants = await listXeroTenantConnections(tokenResponse.access_token);

    if (!tenants.length) {
      await clearStoredConnection(workspaceId, "user", companyId);
      return xeroRedirect(appUrl, {
        xero: "error",
        message: "No Xero organisations were returned for this account.",
      });
    }

    const connectedAt = new Date().toISOString();
    const tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString();
    const connectedUser = extractXeroConnectedUser(tokenResponse.id_token);
    const availableOrganisations = mapXeroTenantsToOrganisationOptions(tenants);

    const baseStored: XeroStoredConnection = {
      connected: false,
      status: tenants.length === 1 ? "Connected" : "Pending Organisation",
      organisationName: "—",
      tenantId: "—",
      connectedUser,
      connectedAt: tenants.length === 1 ? connectedAt : null,
      lastSyncAt: null,
      lastTokenRefreshAt: connectedAt,
      pendingOrganisationSelection: tenants.length > 1,
      availableOrganisations,
      selectedOrganisationId: null,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      tokenExpiresAt,
      auditEvents: [],
    };

    if (tenants.length === 1) {
      const tenant = tenants[0];
      const tenantId = tenant.tenantId || tenant.id;
      baseStored.connected = true;
      baseStored.status = "Connected";
      baseStored.organisationName = tenant.tenantName;
      baseStored.tenantId = tenantId;
      baseStored.selectedOrganisationId = tenantId;
      baseStored.pendingOrganisationSelection = false;
    }

    await writeStoredConnection(workspaceId, baseStored);
    await appendXeroAuditEvent(
      workspaceId,
      {
        event: "oauth_callback_completed",
        actor: connectedUser,
        companyId,
        detail:
          tenants.length === 1
            ? `OAuth completed and organisation ${tenants[0].tenantName} selected.`
            : `OAuth completed. ${tenants.length} organisations available for selection.`,
        metadata: {
          organisationCount: tenants.length,
          availableOrganisations,
        },
      },
      companyId
    );

    if (tenants.length === 1) {
      await appendXeroAuditEvent(
        workspaceId,
        {
          event: "organisation_selected",
          actor: connectedUser,
          companyId,
          detail: `Selected Xero organisation ${tenants[0].tenantName}.`,
          metadata: { tenantId: tenants[0].tenantId || tenants[0].id },
        },
        companyId
      );
      return xeroRedirect(appUrl, {
        xero: "connected",
        message: `Connected to ${tenants[0].tenantName}.`,
      });
    }

    return xeroRedirect(appUrl, {
      xero: "select-org",
      message: "Select the Xero organisation for this workspace.",
    });
  } catch (error) {
    await clearStoredConnection(workspaceId, "user", companyId);
    const message = error instanceof Error ? error.message : "Xero connection failed.";
    return xeroRedirect(appUrl, { xero: "error", message });
  }
}
