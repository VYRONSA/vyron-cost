import {
  exchangeXeroAuthorizationCode,
  type XeroOAuthTokenResponse,
  type XeroStoredConnection,
} from "@/lib/vyron-xero-integration";
import { appendXeroAuditEvent, readStoredConnection, writeStoredConnection } from "@/lib/vyron-xero-connection-store";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

export class XeroApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "XeroApiError";
    this.status = status;
    this.code = code;
  }
}

export async function refreshXeroAccessToken(refreshToken: string): Promise<XeroOAuthTokenResponse> {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new XeroApiError("Xero OAuth is not configured.", 500);
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new XeroApiError(`Xero token refresh failed (${response.status}): ${detail}`, response.status);
  }

  return (await response.json()) as XeroOAuthTokenResponse;
}

function tokenExpired(stored: XeroStoredConnection, skewMs = 60_000) {
  if (!stored.tokenExpiresAt) return true;
  return new Date(stored.tokenExpiresAt).getTime() <= Date.now() + skewMs;
}

export async function getValidXeroAccessToken(
  workspaceId: string,
  options: { companyId?: string | null; actor?: string } = {}
): Promise<{ accessToken: string; tenantId: string; stored: XeroStoredConnection }> {
  const stored = await readStoredConnection(workspaceId);
  if (!stored?.accessToken || !stored.refreshToken) {
    throw new XeroApiError("Not connected to Xero.", 401);
  }

  const tenantId = stored.selectedOrganisationId || stored.tenantId;
  if (!tenantId || tenantId === "—") {
    throw new XeroApiError("No Xero organisation selected for this workspace.", 400);
  }

  if (!tokenExpired(stored)) {
    return { accessToken: stored.accessToken, tenantId, stored };
  }

  const refreshed = await refreshXeroAccessToken(stored.refreshToken);
  const next: XeroStoredConnection = {
    ...stored,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || stored.refreshToken,
    tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    status: stored.connected ? "Connected" : stored.status,
    lastTokenRefreshAt: new Date().toISOString(),
  };

  await writeStoredConnection(workspaceId, next);
  await appendXeroAuditEvent(
    workspaceId,
    {
      event: "token_refreshed",
      actor: options.actor || "system",
      companyId: options.companyId ?? null,
      detail: "Xero access token refreshed.",
    },
    options.companyId
  );

  return { accessToken: next.accessToken, tenantId, stored: next };
}

function parseXeroError(status: number, body: string) {
  try {
    const parsed = JSON.parse(body) as {
      Message?: string;
      Detail?: string;
      Elements?: Array<{ ValidationErrors?: Array<{ Message?: string }> }>;
    };
    const validation =
      parsed.Elements?.flatMap((el) => el.ValidationErrors?.map((v) => v.Message).filter(Boolean) || []).join("; ") ||
      "";
    const message = validation || parsed.Message || parsed.Detail || body;
    if (status === 401) return new XeroApiError(message || "Xero unauthorized.", 401);
    if (status === 403) return new XeroApiError(message || "Xero organisation access denied.", 403);
    if (status === 429) return new XeroApiError(message || "Xero rate limit exceeded.", 429);
    return new XeroApiError(message || `Xero API error (${status}).`, status);
  } catch {
    return new XeroApiError(body || `Xero API error (${status}).`, status);
  }
}

export async function xeroApiRequest<T>(
  workspaceId: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    companyId?: string | null;
    actor?: string;
  } = {}
): Promise<T> {
  const attempt = async (retried: boolean): Promise<T> => {
    const { accessToken, tenantId } = await getValidXeroAccessToken(workspaceId, {
      companyId: options.companyId,
      actor: options.actor,
    });

    const response = await fetch(`${XERO_API_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "xero-tenant-id": tenantId,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    if (response.status === 401 && !retried) {
      const stored = await readStoredConnection(workspaceId);
      if (stored) {
        await writeStoredConnection(workspaceId, {
          ...stored,
          tokenExpiresAt: new Date(0).toISOString(),
        });
      }
      return attempt(true);
    }

    if (!response.ok) {
      throw parseXeroError(response.status, text);
    }

    return text ? (JSON.parse(text) as T) : ({} as T);
  };

  return attempt(false);
}

export async function testXeroConnection(
  workspaceId: string,
  options: { companyId?: string | null; actor?: string } = {}
) {
  const org = await xeroApiRequest<{ Organisations?: Array<{ Name?: string; OrganisationID?: string }> }>(
    workspaceId,
    "/Organisation",
    options
  );
  const organisation = org.Organisations?.[0];
  await appendXeroAuditEvent(
    workspaceId,
    {
      event: "test_connection",
      actor: options.actor || "user",
      companyId: options.companyId ?? null,
      detail: organisation?.Name ? `Connection healthy for ${organisation.Name}.` : "Connection test succeeded.",
      metadata: { organisationId: organisation?.OrganisationID },
    },
    options.companyId
  );
  return {
    healthy: true,
    organisationName: organisation?.Name || null,
    organisationId: organisation?.OrganisationID || null,
  };
}

export type XeroContactResponse = {
  Contacts?: Array<{ ContactID?: string; Name?: string }>;
};

export type XeroInvoiceResponse = {
  Invoices?: Array<{ InvoiceID?: string; InvoiceNumber?: string; Status?: string }>;
};

export { exchangeXeroAuthorizationCode };
