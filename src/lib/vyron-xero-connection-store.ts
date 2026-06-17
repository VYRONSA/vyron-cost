import {
  defaultXeroConnection,
  sanitizeConnectionForClient,
  type XeroAuditEvent,
  type XeroConnectionState,
  type XeroOrganisationOption,
  type XeroStoredConnection,
} from "@/lib/vyron-xero-integration";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

const memoryStore = new Map<string, XeroStoredConnection>();
const CONNECTING_TIMEOUT_MS = 5 * 60 * 1000;

function capAuditEvents(events: XeroAuditEvent[] | undefined, entry: XeroAuditEvent) {
  return [...(events || []), entry].slice(-100);
}

function emptyStoredConnection(): XeroStoredConnection {
  return {
    ...defaultXeroConnection(),
    accessToken: "",
    refreshToken: "",
    tokenExpiresAt: null,
    auditEvents: [],
    lastError: null,
    lastErrorCode: null,
    lastAttemptedAt: null,
    connectStartedAt: null,
  };
}

function hasValidTokens(stored: XeroStoredConnection | null | undefined) {
  return Boolean(stored?.accessToken?.trim() && stored?.refreshToken?.trim());
}

function getConnectStartedAt(stored: XeroStoredConnection): number | null {
  if (stored.connectStartedAt) {
    const ts = new Date(stored.connectStartedAt).getTime();
    if (!Number.isNaN(ts)) return ts;
  }

  const events = stored.auditEvents || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.event === "connect_started") {
      const ts = new Date(events[index].at).getTime();
      if (!Number.isNaN(ts)) return ts;
    }
  }

  return null;
}

export function normalizeStoredConnection(stored: XeroStoredConnection): XeroStoredConnection {
  const hasToken = hasValidTokens(stored);

  if (hasToken && stored.pendingOrganisationSelection) {
    return {
      ...stored,
      status: "Pending Organisation",
      connected: false,
      connectStartedAt: null,
      lastError: null,
      lastErrorCode: null,
    };
  }

  if (
    hasToken &&
    (stored.selectedOrganisationId || (stored.tenantId && stored.tenantId !== "—"))
  ) {
    return {
      ...stored,
      status: "Connected",
      connected: true,
      connectStartedAt: null,
      lastError: null,
      lastErrorCode: null,
    };
  }

  if (stored.status === "Connecting") {
    if (hasToken) {
      return {
        ...stored,
        status: stored.pendingOrganisationSelection ? "Pending Organisation" : "Connected",
        connected: !stored.pendingOrganisationSelection,
        connectStartedAt: null,
      };
    }

    const startedAt = getConnectStartedAt(stored);
    if (startedAt && Date.now() - startedAt > CONNECTING_TIMEOUT_MS) {
      return {
        ...stored,
        status: "Error",
        connected: false,
        connectionHealth: "disconnected",
        lastError: stored.lastError || "Connection failed or incomplete.",
        lastErrorCode: stored.lastErrorCode || "connecting_timeout",
        lastAttemptedAt: stored.lastAttemptedAt || new Date(startedAt).toISOString(),
        connectStartedAt: null,
      };
    }
  }

  if (!hasToken && stored.status === "Connecting") {
    return stored;
  }

  if (!hasToken && stored.status !== "Error" && stored.status !== "Sync Error" && stored.status !== "Token Expired") {
    return {
      ...stored,
      status: "Not Connected",
      connected: false,
      connectionHealth: "disconnected",
    };
  }

  return stored;
}

export async function readStoredConnection(workspaceId: string): Promise<XeroStoredConnection | null> {
  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data, error } = await supabase
        .from("vyron_xero_workspace_settings")
        .select("connection")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) {
        console.error("[Xero connection] read failed:", error.message);
      } else if (data?.connection && typeof data.connection === "object") {
        return data.connection as XeroStoredConnection;
      }
    }
  }

  return memoryStore.get(workspaceId) || null;
}

export async function readConnection(workspaceId: string): Promise<XeroConnectionState> {
  const stored = await readStoredConnection(workspaceId);
  if (!stored) return defaultXeroConnection();

  const normalized = normalizeStoredConnection(stored);
  if (
    normalized.status !== stored.status ||
    normalized.connected !== stored.connected ||
    normalized.lastError !== stored.lastError
  ) {
    await writeStoredConnection(workspaceId, normalized);
  }

  return sanitizeConnectionForClient(normalized);
}

export async function writeStoredConnection(workspaceId: string, connection: XeroStoredConnection) {
  const normalized = normalizeStoredConnection(connection);
  memoryStore.set(workspaceId, normalized);

  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { error } = await supabase.from("vyron_xero_workspace_settings").upsert(
        {
          workspace_id: workspaceId,
          connection: normalized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" }
      );
      if (error) {
        console.error("[Xero connection] write failed:", error.message);
      }
    }
  }
}

export async function appendXeroAuditEvent(
  workspaceId: string,
  event: Omit<XeroAuditEvent, "at" | "workspaceId">,
  companyId?: string | null
) {
  const current = (await readStoredConnection(workspaceId)) || emptyStoredConnection();
  const entry: XeroAuditEvent = {
    at: new Date().toISOString(),
    workspaceId,
    companyId: companyId ?? event.companyId ?? null,
    ...event,
  };
  await writeStoredConnection(workspaceId, {
    ...current,
    auditEvents: capAuditEvents(current.auditEvents, entry),
  });
  return entry;
}

export async function markConnectionError(
  workspaceId: string,
  message: string,
  options: {
    code?: string;
    actor?: string;
    companyId?: string | null;
    clearTokens?: boolean;
  } = {}
) {
  const current = await readStoredConnection(workspaceId);
  const actor = options.actor || "user";
  const next: XeroStoredConnection = {
    ...(current || emptyStoredConnection()),
    connected: false,
    status: "Error",
    connectionHealth: "disconnected",
    lastError: message,
    lastErrorCode: options.code || "connection_error",
    lastAttemptedAt: new Date().toISOString(),
    connectStartedAt: null,
    pendingOrganisationSelection: false,
    accessToken: options.clearTokens ? "" : current?.accessToken || "",
    refreshToken: options.clearTokens ? "" : current?.refreshToken || "",
    auditEvents: capAuditEvents(current?.auditEvents, {
      at: new Date().toISOString(),
      workspaceId,
      companyId: options.companyId ?? null,
      event: "connection_error",
      actor,
      detail: message,
      metadata: { code: options.code || "connection_error" },
    }),
  };
  await writeStoredConnection(workspaceId, next);
  return sanitizeConnectionForClient(next);
}

export async function markTokenExpired(
  workspaceId: string,
  message: string,
  options: { actor?: string; companyId?: string | null } = {}
) {
  const current = await readStoredConnection(workspaceId);
  const next: XeroStoredConnection = {
    ...(current || emptyStoredConnection()),
    connected: false,
    status: "Token Expired",
    connectionHealth: "token_expired",
    lastError: message,
    lastErrorCode: "token_expired",
    lastAttemptedAt: new Date().toISOString(),
    auditEvents: capAuditEvents(current?.auditEvents, {
      at: new Date().toISOString(),
      workspaceId,
      companyId: options.companyId ?? null,
      event: "token_refresh_failed",
      actor: options.actor || "system",
      detail: message,
    }),
  };
  await writeStoredConnection(workspaceId, next);
  return sanitizeConnectionForClient(next);
}

export async function clearStoredConnection(workspaceId: string, actor = "user", companyId?: string | null) {
  const current = await readStoredConnection(workspaceId);
  const disconnected = emptyStoredConnection();
  disconnected.auditEvents = capAuditEvents(current?.auditEvents, {
    at: new Date().toISOString(),
    workspaceId,
    companyId: companyId ?? null,
    event: "disconnect",
    actor,
    detail: "Xero connection cleared for workspace.",
  });
  memoryStore.set(workspaceId, disconnected);

  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from("vyron_xero_workspace_settings").upsert(
        {
          workspace_id: workspaceId,
          connection: disconnected,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" }
      );
    }
  }
}

export async function markConnectionConnecting(workspaceId: string, actor = "user", companyId?: string | null) {
  const current = await readStoredConnection(workspaceId);
  const now = new Date().toISOString();
  const next: XeroStoredConnection = {
    ...(current || emptyStoredConnection()),
    connected: false,
    status: "Connecting",
    organisationName: "—",
    tenantId: "—",
    connectedUser: "—",
    connectedAt: null,
    pendingOrganisationSelection: false,
    availableOrganisations: [],
    selectedOrganisationId: null,
    accessToken: "",
    refreshToken: "",
    tokenExpiresAt: null,
    connectStartedAt: now,
    lastAttemptedAt: now,
    lastError: null,
    lastErrorCode: null,
    auditEvents: capAuditEvents(current?.auditEvents, {
      at: now,
      workspaceId,
      companyId: companyId ?? null,
      event: "connect_started",
      actor,
      detail: "Xero OAuth connect started.",
    }),
  };
  await writeStoredConnection(workspaceId, next);
}

export async function resetConnectionState(
  workspaceId: string,
  actor = "user",
  companyId?: string | null
): Promise<XeroConnectionState> {
  const current = await readStoredConnection(workspaceId);
  const now = new Date().toISOString();

  if (hasValidTokens(current)) {
    const base = normalizeStoredConnection({
      ...(current as XeroStoredConnection),
      connectStartedAt: null,
      lastError: null,
      lastErrorCode: null,
    });
    const next: XeroStoredConnection = {
      ...base,
      auditEvents: capAuditEvents(base.auditEvents, {
        at: now,
        workspaceId,
        companyId: companyId ?? null,
        event: "connection_state_reset",
        actor,
        detail: "Stale connecting state cleared. Existing Xero tokens retained.",
      }),
    };
    await writeStoredConnection(workspaceId, next);
    return sanitizeConnectionForClient(next);
  }

  const disconnected = emptyStoredConnection();
  disconnected.auditEvents = capAuditEvents(current?.auditEvents, {
    at: now,
    workspaceId,
    companyId: companyId ?? null,
    event: "connection_state_reset",
    actor,
    detail: "Connection state reset to Not Connected.",
  });
  await writeStoredConnection(workspaceId, disconnected);
  return sanitizeConnectionForClient(disconnected);
}

export async function selectXeroOrganisation(
  workspaceId: string,
  tenantId: string,
  options: { actor?: string; companyId?: string | null } = {}
) {
  const current = await readStoredConnection(workspaceId);
  if (!current?.accessToken) {
    throw new Error("Xero OAuth is not complete. Connect Xero first.");
  }

  const organisations = current.availableOrganisations || [];
  const selected = organisations.find((org) => org.tenantId === tenantId);
  if (!selected) {
    throw new Error("Selected organisation is not available for this Xero connection.");
  }

  const actor = options.actor || "user";
  const next: XeroStoredConnection = {
    ...current,
    connected: true,
    status: "Connected",
    pendingOrganisationSelection: false,
    selectedOrganisationId: selected.tenantId,
    organisationName: selected.tenantName,
    tenantId: selected.tenantId,
    connectedAt: current.connectedAt || new Date().toISOString(),
    connectStartedAt: null,
    lastError: null,
    lastErrorCode: null,
    auditEvents: capAuditEvents(current.auditEvents, {
      at: new Date().toISOString(),
      workspaceId,
      companyId: options.companyId ?? null,
      event: "organisation_selected",
      actor,
      detail: `Selected Xero organisation ${selected.tenantName}.`,
      metadata: { tenantId: selected.tenantId },
    }),
  };

  await writeStoredConnection(workspaceId, next);
  return sanitizeConnectionForClient(next);
}

export function pendingOrganisationSelection(stored: XeroStoredConnection | null) {
  return Boolean(stored?.pendingOrganisationSelection && (stored.availableOrganisations?.length || 0) > 0);
}

export function organisationOptionsFromStored(stored: XeroStoredConnection | null): XeroOrganisationOption[] {
  return stored?.availableOrganisations || [];
}
