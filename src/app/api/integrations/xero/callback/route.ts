import { NextRequest, NextResponse } from "next/server";
import {
  appendXeroAuditEvent,
  markConnectionError,
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
import { syncFinancialAccountCatalogFromXero } from "@/lib/vyron-financial-engine";

export const runtime = "nodejs";

function xeroRedirect(appUrl: string, params: Record<string, string>) {
  const url = new URL("/integrations/xero", appUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

async function failCallback(
  workspaceId: string | null,
  companyId: string | null,
  message: string,
  code: string,
  appUrl: string
) {
  if (workspaceId) {
    await markConnectionError(workspaceId, message, {
      code,
      actor: "xero-callback",
      companyId,
      clearTokens: true,
    });
  }
  return xeroRedirect(appUrl, { xero: "error", message });
}

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  const oauthErrorDescription = request.nextUrl.searchParams.get("error_description");

  const decodedState = state ? decodeXeroOAuthState(state) : null;
  const activeWorkspace = await getServerActiveWorkspace();
  const workspaceId = activeWorkspace?.id || decodedState?.workspaceId || null;
  const companyId = workspaceId ? await getWorkspaceCompanyId() : null;

  if (oauthError) {
    const message = oauthErrorDescription
      ? `Xero authorization failed (${oauthError}): ${oauthErrorDescription}`
      : `Xero authorization was declined or failed (${oauthError}).`;
    return failCallback(workspaceId, companyId, message, oauthError, appUrl);
  }

  if (!code || !state) {
    return failCallback(workspaceId, companyId, "Missing Xero authorization code.", "missing_code", appUrl);
  }

  if (!workspaceId || !companyId) {
    return xeroRedirect(appUrl, {
      xero: "error",
      message: "No active workspace. Select a client workspace before connecting Xero.",
    });
  }

  if (!decodedState || decodedState.workspaceId !== workspaceId) {
    return failCallback(
      workspaceId,
      companyId,
      "Xero OAuth workspace mismatch. Connect again from the active workspace.",
      "workspace_mismatch",
      appUrl
    );
  }

  if (decodedState.companyId && decodedState.companyId !== companyId) {
    return failCallback(
      workspaceId,
      companyId,
      "Xero OAuth company mismatch. Connect again from the active workspace.",
      "company_mismatch",
      appUrl
    );
  }

  if (!isXeroOAuthConfigured()) {
    return failCallback(workspaceId, companyId, "Xero OAuth is not configured on the server.", "oauth_not_configured", appUrl);
  }

  try {
    await requireWorkspacePermission("xero.connect");
    await appendXeroAuditEvent(
      workspaceId,
      {
        event: "oauth_callback_started",
        actor: "xero-callback",
        companyId,
        detail: "Xero OAuth callback received.",
      },
      companyId
    );

    let tokenResponse;
    try {
      tokenResponse = await exchangeXeroAuthorizationCode(code);
      await appendXeroAuditEvent(
        workspaceId,
        {
          event: "token_exchange_success",
          actor: "xero-callback",
          companyId,
          detail: "Xero authorization code exchanged for tokens.",
        },
        companyId
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Xero token exchange failed.";
      await appendXeroAuditEvent(
        workspaceId,
        {
          event: "token_exchange_failed",
          actor: "xero-callback",
          companyId,
          detail: message,
          metadata: { code: "token_exchange_failed" },
        },
        companyId
      );
      return failCallback(workspaceId, companyId, message, "token_exchange_failed", appUrl);
    }

    let tenants;
    try {
      tenants = await listXeroTenantConnections(tokenResponse.access_token);
      await appendXeroAuditEvent(
        workspaceId,
        {
          event: "tenants_fetched",
          actor: "xero-callback",
          companyId,
          detail: `Fetched ${tenants.length} Xero organisation(s).`,
          metadata: { organisationCount: tenants.length },
        },
        companyId
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Xero organisation lookup failed.";
      return failCallback(workspaceId, companyId, message, "tenants_fetch_failed", appUrl);
    }

    if (!tenants.length) {
      return failCallback(
        workspaceId,
        companyId,
        "No Xero organisations were returned for this account.",
        "no_tenants",
        appUrl
      );
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
      lastAttemptedAt: connectedAt,
      connectStartedAt: null,
      lastError: null,
      lastErrorCode: null,
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

      try {
        const synced = await syncFinancialAccountCatalogFromXero(workspaceId, companyId, {
          actor: connectedUser,
          integrationType: "XERO",
        });
        await appendXeroAuditEvent(
          workspaceId,
          {
            event: "account_catalog_synced",
            actor: connectedUser,
            companyId,
            detail: `Automatically synced ${synced.accountCount} Xero account(s) after connection.`,
            metadata: { accountCount: synced.accountCount },
          },
          companyId
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Automatic Xero account sync failed.";
        await appendXeroAuditEvent(
          workspaceId,
          {
            event: "account_catalog_sync_failed",
            actor: connectedUser,
            companyId,
            detail: message,
          },
          companyId
        );
      }

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
    const message = error instanceof Error ? error.message : "Xero connection failed.";
    return failCallback(workspaceId, companyId, message, "callback_failed", appUrl);
  }
}
