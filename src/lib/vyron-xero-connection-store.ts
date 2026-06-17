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

function capAuditEvents(events: XeroAuditEvent[] | undefined, entry: XeroAuditEvent) {
  return [...(events || []), entry].slice(-100);
}

export async function readStoredConnection(workspaceId: string): Promise<XeroStoredConnection | null> {
  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from("vyron_xero_workspace_settings")
        .select("connection")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (data?.connection && typeof data.connection === "object") {
        return data.connection as XeroStoredConnection;
      }
    }
  }

  return memoryStore.get(workspaceId) || null;
}

export async function readConnection(workspaceId: string): Promise<XeroConnectionState> {
  const stored = await readStoredConnection(workspaceId);
  if (!stored) return defaultXeroConnection();
  return sanitizeConnectionForClient(stored);
}

export async function writeStoredConnection(workspaceId: string, connection: XeroStoredConnection) {
  memoryStore.set(workspaceId, connection);

  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from("vyron_xero_workspace_settings").upsert({
        workspace_id: workspaceId,
        connection,
        updated_at: new Date().toISOString(),
      });
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

function emptyStoredConnection(): XeroStoredConnection {
  return {
    ...defaultXeroConnection(),
    accessToken: "",
    refreshToken: "",
    tokenExpiresAt: null,
    auditEvents: [],
  };
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
      await supabase.from("vyron_xero_workspace_settings").upsert({
        workspace_id: workspaceId,
        connection: disconnected,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

export async function markConnectionConnecting(workspaceId: string, actor = "user", companyId?: string | null) {
  const current = await readStoredConnection(workspaceId);
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
    auditEvents: capAuditEvents(current?.auditEvents, {
      at: new Date().toISOString(),
      workspaceId,
      companyId: companyId ?? null,
      event: "connect_started",
      actor,
      detail: "Xero OAuth connect started.",
    }),
  };
  await writeStoredConnection(workspaceId, next);
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
