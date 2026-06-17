import { createHmac, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type XeroSyncStatus = "Ready" | "Synced" | "Failed" | "Needs Review" | "Processing" | "Cancelled";

export type XeroConnectionStatus =
  | "Not Connected"
  | "Connecting"
  | "Connected"
  | "Pending Organisation"
  | "Token Expired"
  | "Sync Error";

export type XeroQueueEntityType =
  | "Customer"
  | "Supplier"
  | "Customer Invoice"
  | "Supplier Bill"
  | "Item"
  | "Purchase Order";

export type XeroOrganisationOption = {
  tenantId: string;
  tenantName: string;
};

export type XeroAuditEvent = {
  at: string;
  event: string;
  workspaceId: string;
  companyId?: string | null;
  actor?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
};

export type XeroConnectionState = {
  connected: boolean;
  status: XeroConnectionStatus;
  organisationName: string;
  tenantId: string;
  connectedUser: string;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastTokenRefreshAt?: string | null;
  tokenExpiresAt?: string | null;
  connectionHealth?: "healthy" | "token_expired" | "sync_error" | "disconnected" | "pending_organisation";
  pendingOrganisationSelection?: boolean;
  availableOrganisations?: XeroOrganisationOption[];
  selectedOrganisationId?: string | null;
  auditEvents?: XeroAuditEvent[];
};

export type XeroStoredConnection = XeroConnectionState & {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string | null;
  lastTokenRefreshAt?: string | null;
};

export type XeroOAuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
};

export type XeroTenantConnection = {
  id: string;
  tenantId: string;
  tenantType: string;
  tenantName: string;
  createdDateUtc: string;
  updatedDateUtc: string;
};

export type XeroAccountMapping = {
  salesAccount: string;
  costOfSalesAccount: string;
  inventoryAssetAccount: string;
  packagingAccount: string;
  manufacturingVarianceAccount: string;
  stockAdjustmentAccount: string;
  vatStandard: string;
  zeroRated: string;
  exempt: string;
};

export const DEFAULT_XERO_ACCOUNT_MAPPING: XeroAccountMapping = {
  salesAccount: "200",
  costOfSalesAccount: "310",
  inventoryAssetAccount: "630",
  packagingAccount: "315",
  manufacturingVarianceAccount: "320",
  stockAdjustmentAccount: "625",
  vatStandard: "820",
  zeroRated: "821",
  exempt: "822",
};

export const XERO_CONNECTION_STORAGE_PREFIX = "vyron_xero_connection_";
export const XERO_MAPPING_STORAGE_PREFIX = "vyron_xero_account_mapping_";

export function xeroStorageKey(prefix: string, clientId = "default") {
  return `${prefix}${clientId}`;
}

export function defaultXeroConnection(): XeroConnectionState {
  return {
    connected: false,
    status: "Not Connected",
    organisationName: "—",
    tenantId: "—",
    connectedUser: "—",
    connectedAt: null,
    lastSyncAt: null,
  };
}

export function sanitizeConnectionForClient(stored: XeroStoredConnection): XeroConnectionState {
  if (stored.tenantId?.startsWith("demo-tenant")) {
    return defaultXeroConnection();
  }

  const status = stored.status || (stored.connected ? "Connected" : "Not Connected");
  const tokenExpired =
    stored.tokenExpiresAt && new Date(stored.tokenExpiresAt).getTime() <= Date.now();
  let connectionHealth: XeroConnectionState["connectionHealth"] = "disconnected";
  if (stored.pendingOrganisationSelection) connectionHealth = "pending_organisation";
  else if (status === "Token Expired" || tokenExpired) connectionHealth = "token_expired";
  else if (status === "Sync Error") connectionHealth = "sync_error";
  else if (stored.connected) connectionHealth = "healthy";

  return {
    connected: stored.connected,
    status,
    organisationName: stored.organisationName,
    tenantId: stored.tenantId,
    connectedUser: stored.connectedUser,
    connectedAt: stored.connectedAt,
    lastSyncAt: stored.lastSyncAt,
    lastTokenRefreshAt: stored.lastTokenRefreshAt || null,
    tokenExpiresAt: stored.tokenExpiresAt,
    connectionHealth,
    pendingOrganisationSelection: stored.pendingOrganisationSelection,
    availableOrganisations: stored.availableOrganisations,
    selectedOrganisationId: stored.selectedOrganisationId,
    auditEvents: (stored.auditEvents || []).slice(-25),
  };
}

export function mapXeroTenantsToOrganisationOptions(tenants: XeroTenantConnection[]): XeroOrganisationOption[] {
  return tenants.map((tenant) => ({
    tenantId: tenant.tenantId || tenant.id,
    tenantName: tenant.tenantName,
  }));
}

export function isXeroOAuthConfigured() {
  return Boolean(
    process.env.XERO_CLIENT_ID &&
      process.env.XERO_CLIENT_SECRET &&
      process.env.XERO_REDIRECT_URI
  );
}

/** Official Xero OAuth scopes for web server apps (offline_access required for refresh). */
export const XERO_OAUTH_SCOPE_LIST = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.transactions",
  "accounting.contacts",
  "accounting.settings",
] as const;

export const XERO_OAUTH_SCOPES = XERO_OAUTH_SCOPE_LIST.join(" ");

export type XeroOAuthDebugInfo = {
  clientId: string | null;
  redirectUri: string | null;
  scopes: string;
};

export function getXeroOAuthDebugInfo(): XeroOAuthDebugInfo {
  return {
    clientId: process.env.XERO_CLIENT_ID?.trim() || null,
    redirectUri: getXeroRedirectUri(),
    scopes: XERO_OAUTH_SCOPES,
  };
}

export function getXeroRedirectUri() {
  const redirectUri = process.env.XERO_REDIRECT_URI?.trim();
  if (!redirectUri) return null;
  return redirectUri.replace(/\/$/, "");
}

function oauthStateSecret() {
  return process.env.XERO_CLIENT_SECRET || process.env.XERO_STATE_SECRET || "";
}

type OAuthStatePayload = {
  workspaceId: string;
  companyId: string;
  nonce: string;
  ts: number;
  sig?: string;
};

export function encodeXeroOAuthState(workspaceId: string, companyId: string) {
  const payload: OAuthStatePayload = {
    workspaceId,
    companyId,
    nonce: randomBytes(16).toString("hex"),
    ts: Date.now(),
  };
  const secret = oauthStateSecret();
  if (secret) {
    payload.sig = createHmac("sha256", secret).update(JSON.stringify(payload)).digest("base64url");
  }
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeXeroOAuthState(state: string): { workspaceId: string; companyId: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as OAuthStatePayload & {
      clientId?: string;
    };
    const workspaceId = parsed.workspaceId?.trim() || parsed.clientId?.trim() || "";
    const companyId = parsed.companyId?.trim() || "";
    if (!workspaceId) return null;

    const secret = oauthStateSecret();
    if (secret && parsed.sig) {
      const { sig, ...unsigned } = parsed;
      const expected = createHmac("sha256", secret).update(JSON.stringify(unsigned)).digest("base64url");
      if (sig !== expected) return null;
    }

    if (Date.now() - Number(parsed.ts || 0) > 30 * 60 * 1000) return null;
    return { workspaceId, companyId };
  } catch {
    return null;
  }
}

export function buildXeroOAuthUrl(workspaceId: string, companyId: string) {
  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = getXeroRedirectUri();
  if (!clientId || !redirectUri) return null;

  const debug = getXeroOAuthDebugInfo();
  console.info("[Xero OAuth] authorize redirect", {
    clientId: debug.clientId,
    redirectUri: debug.redirectUri,
    scopes: debug.scopes,
    workspaceId,
    companyId,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: XERO_OAUTH_SCOPES,
    state: encodeXeroOAuthState(workspaceId, companyId),
  });

  return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
}

export async function exchangeXeroAuthorizationCode(code: string): Promise<XeroOAuthTokenResponse> {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = getXeroRedirectUri();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Xero OAuth is not configured.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
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
    throw new Error(`Xero token exchange failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as XeroOAuthTokenResponse;
}

export async function listXeroTenantConnections(accessToken: string): Promise<XeroTenantConnection[]> {
  const response = await fetch("https://api.xero.com/connections", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Xero connections lookup failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as XeroTenantConnection[];
}

export function extractXeroConnectedUser(idToken?: string) {
  if (!idToken) return "Xero user";

  try {
    const payload = idToken.split(".")[1];
    if (!payload) return "Xero user";
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      name?: string;
      preferred_username?: string;
    };
    return decoded.email || decoded.preferred_username || decoded.name || "Xero user";
  } catch {
    return "Xero user";
  }
}

export async function queueXeroSupplierBill(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    documentId: string;
    invoiceNumber: string | null;
    supplierName: string;
    total: number;
    invoiceDate?: string | null;
    status?: XeroSyncStatus;
    errorMessage?: string | null;
  }
) {
  const reference = input.invoiceNumber || `DOC-${input.documentId.slice(0, 8)}`;
  const { data: existing } = await supabase
    .from("vyron_xero_sync_queue")
    .select("id")
    .eq("company_id", companyId)
    .eq("reference_number", reference)
    .eq("entity_type", "Supplier Bill")
    .maybeSingle();
  if (existing) return existing;

  const needsReview = !input.supplierName?.trim();
  const status: XeroSyncStatus = input.status || (needsReview ? "Needs Review" : "Ready");

  const { data, error } = await supabase
    .from("vyron_xero_sync_queue")
    .insert({
      company_id: companyId,
      entity_type: "Supplier Bill",
      entity_id: input.documentId,
      reference_number: reference,
      destination: "Xero Bill",
      status,
      error_message: needsReview ? "Supplier name missing before sync." : input.errorMessage || null,
      payload: {
        supplierName: input.supplierName,
        invoiceNumber: reference,
        invoiceDate: input.invoiceDate,
        total: input.total,
      },
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await appendXeroAuditForCompanyQueue(companyId, {
    event: "sync_queued",
    detail: `Queued supplier bill ${reference} for Xero sync.`,
    metadata: { queueItemId: data.id, entityType: "Supplier Bill" },
  });
  return data;
}

async function appendXeroAuditForCompanyQueue(
  companyId: string,
  event: { event: string; detail?: string; metadata?: Record<string, unknown> }
) {
  try {
    const { getServerActiveWorkspace, getWorkspaceCompanyId } = await import("@/lib/vyron-workspace-server");
    const { appendXeroAuditEvent } = await import("@/lib/vyron-xero-connection-store");
    const workspace = await getServerActiveWorkspace();
    const activeCompanyId = await getWorkspaceCompanyId();
    if (!workspace?.id || activeCompanyId !== companyId) return;
    await appendXeroAuditEvent(workspace.id, { ...event, companyId }, companyId);
  } catch {
    // best-effort audit when queueing from background flows
  }
}

export async function listXeroSyncQueueRows(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_xero_sync_queue")
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}

export function mapQueueRowToDisplay(row: Record<string, unknown>) {
  const payload = (row.payload || {}) as Record<string, unknown>;
  const entityType = String(row.entity_type || "Item") as XeroQueueEntityType;
  const counterparty =
    String(payload.customerName || payload.supplierName || payload.name || payload.productName || "—");

  return {
    id: String(row.id),
    entityId: row.entity_id ? String(row.entity_id) : undefined,
    type: entityType,
    reference: String(row.reference_number || "—"),
    counterparty,
    status: String(row.status || "Ready") as XeroSyncStatus,
    xeroId: row.xero_id ? String(row.xero_id) : undefined,
    xeroLink: payload.xeroLink ? String(payload.xeroLink) : undefined,
    lastAttempt: String(row.last_attempt_at || row.updated_at || row.created_at || ""),
    createdAt: String(row.created_at || ""),
    syncedAt: row.synced_at ? String(row.synced_at) : undefined,
    retryCount: Number(payload.attemptCount || 0),
    destination: String(row.destination || "Xero"),
    value: Number(payload.salesValue || payload.total || 0),
    note: row.error_message
      ? String(row.error_message)
      : row.status === "Ready"
        ? `Ready to sync to ${row.destination}.`
        : `Status: ${row.status}`,
  };
}

