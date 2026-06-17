"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ExternalLink,
  Link2,
  RefreshCcw,
  RotateCcw,
  Unplug,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { useXeroPermissions } from "@/hooks/useModulePermissions";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import { readActiveClient, ACTIVE_CLIENT_KEY } from "@/lib/vyron-developer-client";
import { documentHasCookie } from "@/lib/vyron-workspace-context";
import { WORKSPACE_SESSION_KEY } from "@/lib/vyron-workspace-session";
import {
  DEFAULT_XERO_ACCOUNT_MAPPING,
  defaultXeroConnection,
  type XeroAccountMapping,
  type XeroAuditEvent,
  type XeroConnectionState,
  type XeroSyncStatus,
} from "@/lib/vyron-xero-integration";
import type { XeroSyncConfig } from "@/lib/vyron-xero-mapping";
import { DEFAULT_XERO_SYNC_CONFIG } from "@/lib/vyron-xero-mapping";

const M = VYRON_MASTER;

const REQUIRED_XERO_ENV = ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI"] as const;

type QueueRow = {
  id: string;
  entityId?: string;
  type: string;
  reference: string;
  counterparty: string;
  status: XeroSyncStatus;
  xeroId?: string;
  xeroLink?: string;
  lastAttempt: string;
  createdAt: string;
  syncedAt?: string;
  retryCount: number;
  note: string;
};

type MappingPanelItem = { label: string; ok: boolean; required: string };

type WorkspaceContext = {
  hasWorkspace: boolean;
  workspaceName: string;
  companyLinked: boolean;
};

type XeroIntegrationClientProps = {
  initialWorkspace: WorkspaceContext;
};

type WorkspaceDebugState = {
  localWorkspaceId: string | null;
  localCompanyId: string | null;
  hasActiveClientCookieDoc: boolean;
  hasSessionCookieDoc: boolean;
  serverWorkspaceId: string | null;
  serverCompanyId: string | null;
  hasWorkspaceCookie: boolean;
  hasSessionCookie: boolean;
  loaded: boolean;
};

type SyncNowAction = "sync-all-customers-now" | "sync-all-suppliers-now" | "sync-all-invoices-now";

const OUTBOUND_SYNC = [
  { key: "outboundCustomers", label: "Customers → Xero Contacts", supported: true },
  { key: "outboundSuppliers", label: "Suppliers → Xero Contacts", supported: true },
  { key: "outboundCustomerInvoices", label: "Customer Invoices → Xero ACCREC Invoices", supported: true },
  { key: "outboundSupplierBills", label: "Supplier Bills → Xero ACCPAY Bills", supported: false },
  { key: "outboundPurchaseOrders", label: "Purchase Orders", supported: false },
  { key: "outboundItems", label: "Items / Products", supported: false },
] as const;

const INBOUND_SYNC = [
  { key: "inboundContacts", label: "Contacts", supported: false },
  { key: "inboundAccounts", label: "Chart of Accounts", supported: false },
  { key: "inboundTaxRates", label: "Tax Rates", supported: false },
  { key: "inboundItems", label: "Items", supported: false },
] as const;

const MAPPING_FIELDS: Array<{ key: keyof XeroAccountMapping; label: string }> = [
  { key: "salesAccount", label: "Sales account" },
  { key: "costOfSalesAccount", label: "Purchases / COGS account" },
  { key: "inventoryAssetAccount", label: "Inventory account" },
  { key: "vatStandard", label: "VAT / tax type" },
  { key: "zeroRated", label: "Zero rated tax" },
  { key: "exempt", label: "Exempt tax" },
];

const SYNC_NOW_LABELS: Record<SyncNowAction, string> = {
  "sync-all-customers-now": "Customer sync",
  "sync-all-suppliers-now": "Supplier sync",
  "sync-all-invoices-now": "Invoice sync",
};

export default function XeroIntegrationClient({ initialWorkspace }: XeroIntegrationClientProps) {
  const searchParams = useSearchParams();
  const { canConnect, canSync, canEditMapping } = useXeroPermissions();
  const [workspaceCtx, setWorkspaceCtx] = useState<WorkspaceContext>(initialWorkspace);
  const [serverHasWorkspace, setServerHasWorkspace] = useState(initialWorkspace.hasWorkspace);
  const [connection, setConnection] = useState<XeroConnectionState>(defaultXeroConnection());
  const [oauthReady, setOauthReady] = useState(false);
  const [missingEnv, setMissingEnv] = useState<string[]>([]);
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [mapping, setMapping] = useState<XeroAccountMapping>(DEFAULT_XERO_ACCOUNT_MAPPING);
  const [syncConfig, setSyncConfig] = useState<XeroSyncConfig>(DEFAULT_XERO_SYNC_CONFIG);
  const [mappingPanel, setMappingPanel] = useState<MappingPanelItem[]>([]);
  const [invoiceSyncReady, setInvoiceSyncReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMapping, setSavingMapping] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [localWorkspaceId, setLocalWorkspaceId] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [workspaceDebug, setWorkspaceDebug] = useState<WorkspaceDebugState>({
    localWorkspaceId: null,
    localCompanyId: null,
    hasActiveClientCookieDoc: false,
    hasSessionCookieDoc: false,
    serverWorkspaceId: null,
    serverCompanyId: null,
    hasWorkspaceCookie: false,
    hasSessionCookie: false,
    loaded: false,
  });

  useEffect(() => {
    fetch("/api/workspace/status", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        const hasServerWorkspace = Boolean(data?.hasWorkspaceCookie ?? data?.hasActiveClientCookie);
        setServerHasWorkspace(hasServerWorkspace);

        if (hasServerWorkspace) {
          setWorkspaceCtx({
            hasWorkspace: true,
            workspaceName: data?.workspaceName || initialWorkspace.workspaceName || "",
            companyLinked: Boolean(data?.companyLinked ?? initialWorkspace.companyLinked),
          });
        }

        const client = readActiveClient();
        setLocalWorkspaceId(client?.id || null);
        setWorkspaceDebug({
          localWorkspaceId: client?.id || null,
          localCompanyId: client?.companyId || null,
          hasActiveClientCookieDoc: documentHasCookie(ACTIVE_CLIENT_KEY),
          hasSessionCookieDoc: documentHasCookie(WORKSPACE_SESSION_KEY),
          serverWorkspaceId: data?.serverWorkspaceId || data?.workspaceId || null,
          serverCompanyId: data?.serverCompanyId || data?.companyId || null,
          hasWorkspaceCookie: hasServerWorkspace,
          hasSessionCookie: Boolean(data?.hasSessionCookie ?? data?.hasWorkspaceSession),
          loaded: true,
        });
      })
      .catch(() => {
        setWorkspaceDebug((current) => ({ ...current, loaded: true }));
      });
  }, [initialWorkspace.companyLinked, initialWorkspace.workspaceName]);

  const hasActiveWorkspace =
    serverHasWorkspace || workspaceCtx.hasWorkspace || initialWorkspace.hasWorkspace;

  const refresh = useCallback(() => {
    setLoading(true);

    const fetchOpts: RequestInit = { credentials: "include" };

    Promise.all([
      fetch("/api/integrations/xero/connection", fetchOpts).then((r) => r.json()),
      fetch("/api/integrations/xero/sync-queue", fetchOpts).then((r) => r.json()),
      fetch("/api/integrations/xero/mapping", fetchOpts).then((r) => r.json()),
    ])
      .then(([connectionData, queueData, mappingData]) => {
        if (connectionData.hasWorkspace === false && !serverHasWorkspace && !initialWorkspace.hasWorkspace) {
          setWorkspaceCtx({
            hasWorkspace: false,
            workspaceName: "",
            companyLinked: false,
          });
        } else if (connectionData.ok || serverHasWorkspace || initialWorkspace.hasWorkspace) {
          setWorkspaceCtx({
            hasWorkspace: true,
            workspaceName: String(
              connectionData.workspaceName || initialWorkspace.workspaceName || workspaceCtx.workspaceName || ""
            ),
            companyLinked: Boolean(
              connectionData.companyLinked ?? initialWorkspace.companyLinked ?? workspaceCtx.companyLinked
            ),
          });
          if (connectionData.ok) {
            setConnection(connectionData.connection || defaultXeroConnection());
            setOauthReady(Boolean(connectionData.oauthReady));
            setMissingEnv(Array.isArray(connectionData.missingEnv) ? connectionData.missingEnv : []);
          }
        } else if (connectionData.error) {
          setError(String(connectionData.error));
        }

        if (queueData.ok && Array.isArray(queueData.items)) {
          setQueueRows(queueData.items as QueueRow[]);
        } else {
          setQueueRows([]);
        }

        if (mappingData.ok) {
          setMapping({ ...DEFAULT_XERO_ACCOUNT_MAPPING, ...(mappingData.mapping || {}) });
          setSyncConfig({ ...DEFAULT_XERO_SYNC_CONFIG, ...(mappingData.syncConfig || {}) });
          setMappingPanel(Array.isArray(mappingData.mappingPanel) ? mappingData.mappingPanel : []);
          setInvoiceSyncReady(Boolean(mappingData.invoiceSyncReady));
        }
      })
      .catch(() => setError("Could not load Xero integration data."))
      .finally(() => setLoading(false));
  }, [
    initialWorkspace.companyLinked,
    initialWorkspace.hasWorkspace,
    initialWorkspace.workspaceName,
    serverHasWorkspace,
    workspaceCtx.companyLinked,
    workspaceCtx.workspaceName,
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onWorkspaceChange = () => refresh();
    window.addEventListener("vyron-active-client-changed", onWorkspaceChange);
    return () => window.removeEventListener("vyron-active-client-changed", onWorkspaceChange);
  }, [refresh]);

  useEffect(() => {
    const xeroStatus = searchParams.get("xero");
    const callbackMessage = searchParams.get("message");
    if (callbackMessage) setMessage(callbackMessage);
    else if (xeroStatus === "connected") setMessage("Xero connected successfully.");
    else if (xeroStatus === "select-org") setMessage("Select the Xero organisation for this workspace.");
    else if (xeroStatus === "error") setError(callbackMessage || "Xero connection failed.");
    if (xeroStatus) refresh();
  }, [searchParams, refresh]);

  const orgSelected = connection.connected && !connection.pendingOrganisationSelection;
  const isPendingOrganisation =
    connection.status === "Pending Organisation" || Boolean(connection.pendingOrganisationSelection);
  const isConnecting = connection.status === "Connecting";
  const isConnectionError = connection.status === "Error" || connection.status === "Sync Error";
  const syncActionsEnabled =
    hasActiveWorkspace && workspaceCtx.companyLinked && orgSelected && canSync && oauthReady;

  const failedQueueRows = useMemo(() => queueRows.filter((row) => row.status === "Failed"), [queueRows]);

  const showRepairWorkspace = !hasActiveWorkspace && Boolean(localWorkspaceId);

  async function repairWorkspaceSession() {
    const client = readActiveClient();
    if (!client?.id) return;

    setRepairing(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/repair", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: client.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Workspace session repair failed.");
        return;
      }
      window.location.href = "/integrations/xero";
    } catch {
      setError("Could not repair workspace session.");
    } finally {
      setRepairing(false);
    }
  }

  function connectXero() {
    setError(null);
    if (!canConnect) {
      setError("You do not have permission to connect Xero.");
      return;
    }
    if (!hasActiveWorkspace) {
      setError("No active workspace. Select a client workspace before connecting Xero.");
      return;
    }
    if (!oauthReady) {
      setError("Xero OAuth is not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET and XERO_REDIRECT_URI.");
      return;
    }
    window.location.href = "/api/integrations/xero/connect";
  }

  async function postConnection(action: string, extra: Record<string, string> = {}) {
    setError(null);
    const res = await fetch("/api/integrations/xero/connection", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error || "Request failed.");
      return null;
    }
    if (data.connection) setConnection(data.connection);
    if (data.test?.organisationName) {
      setMessage(`Connection healthy: ${data.test.organisationName}`);
    } else if (action === "refresh-token") {
      setMessage("Xero access token refreshed.");
    } else if (action === "test-connection") {
      setMessage("Xero connection test passed.");
    } else if (action === "reset-connection-state") {
      setMessage("Xero connection state reset. You can reconnect now.");
    }
    return data;
  }

  async function resetConnectionState() {
    await postConnection("reset-connection-state");
    refresh();
  }

  async function disconnectXero() {
    if (!canConnect) return;
    await postConnection("disconnect");
    setMessage("Disconnected from Xero for this workspace.");
    refresh();
  }

  async function selectOrganisation(tenantId: string) {
    if (!canConnect) return;
    const data = await postConnection("select-organisation", { tenantId });
    if (data) setMessage(`Connected to ${data.connection?.organisationName || "Xero organisation"}.`);
    refresh();
  }

  async function saveMapping() {
    if (!canEditMapping) return;
    setSavingMapping(true);
    try {
      const res = await fetch("/api/integrations/xero/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to save mapping.");
        return;
      }
      setMappingPanel(data.mappingPanel || []);
      setInvoiceSyncReady(Boolean(data.invoiceSyncReady));
      setMessage("Account mapping saved.");
    } finally {
      setSavingMapping(false);
    }
  }

  async function saveSyncConfiguration(next: Partial<XeroSyncConfig>) {
    if (!canEditMapping) return;
    const merged = { ...syncConfig, ...next };
    setSyncConfig(merged);
    const res = await fetch("/api/integrations/xero/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save-sync-config", syncConfig: merged }),
    });
    const data = await res.json();
    if (!data.ok) setError(data.error || "Failed to save sync configuration.");
    else setMessage("Sync configuration saved.");
  }

  async function syncQueueItem(id: string, action: "sync" | "retry" | "cancel") {
    if (!canSync) {
      setError("You do not have permission to sync to Xero.");
      return;
    }
    const res = await fetch("/api/integrations/xero/sync-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error || "Sync action failed.");
    } else {
      setMessage(action === "cancel" ? "Queue item cancelled." : "Sync completed.");
      setSyncErrors([]);
    }
    refresh();
  }

  function formatSyncNowMessage(label: string, data: Record<string, unknown>) {
    const queued = Number(data.queued ?? 0);
    const processed = Number(data.processed ?? 0);
    const succeeded = Number(data.succeeded ?? 0);
    const failed = Number(data.failed ?? 0);
    return `${label} complete: ${queued} queued, ${processed} processed, ${succeeded} succeeded, ${failed} failed.`;
  }

  async function syncNowAction(action: SyncNowAction) {
    if (!canSync) {
      setError("You do not have permission to sync to Xero.");
      return;
    }
    if (!syncActionsEnabled) {
      setError("Connect Xero and select an organisation before running sync actions.");
      return;
    }
    if (action === "sync-all-invoices-now" && !invoiceSyncReady) {
      setError("Invoice sync blocked until sales account and VAT tax type are mapped.");
      return;
    }

    const label = SYNC_NOW_LABELS[action];
    setBulkBusy(action);
    setError(null);
    setSyncErrors([]);

    try {
      const res = await fetch("/api/integrations/xero/sync-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || `${label} failed.`);
        setMessage(null);
        return;
      }

      setMessage(formatSyncNowMessage(label, data));
      setSyncErrors(Array.isArray(data.errors) ? (data.errors as string[]) : []);
    } finally {
      setBulkBusy(null);
      refresh();
    }
  }

  async function bulkQueueAction(action: string) {
    if (!canSync) {
      setError("You do not have permission to sync to Xero.");
      return;
    }
    if (!syncActionsEnabled) {
      setError("Connect Xero and select an organisation before running sync actions.");
      return;
    }

    setBulkBusy(action);
    setError(null);
    setSyncErrors([]);

    try {
      const res = await fetch("/api/integrations/xero/sync-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Bulk sync action failed.");
        return;
      }
      if (action === "retry-failed") {
        setMessage(
          `Retry complete: ${data.retried ?? 0} succeeded, ${data.failed ?? 0} failed of ${data.total ?? 0} item(s).`
        );
      } else if (action === "cancel-pending") {
        setMessage(`Cancelled ${data.cancelled ?? 0} pending queue item(s).`);
      }
    } finally {
      setBulkBusy(null);
      refresh();
    }
  }

  const connectionStatus = connection.status || (connection.connected ? "Connected" : "Not Connected");
  const auditEvents = (connection.auditEvents || []).slice().reverse();
  const displayWorkspaceName = workspaceCtx.workspaceName || initialWorkspace.workspaceName || "—";

  const setupWarnings = useMemo(() => {
    const list: string[] = [];
    if (missingEnv.length) {
      list.push(`Missing environment variables: ${missingEnv.join(", ")}`);
    }
    if (!workspaceCtx.companyLinked && hasActiveWorkspace) {
      list.push("Active workspace is not linked to a company record. Contact support or re-select the workspace.");
    }
    if (connection.pendingOrganisationSelection) {
      list.push("Xero organisation selection required before sync can run.");
    }
    if (!invoiceSyncReady) {
      list.push("Invoice sync blocked until sales account and VAT tax type are mapped.");
    }
    return list;
  }, [missingEnv, workspaceCtx, connection.pendingOrganisationSelection, invoiceSyncReady]);

  if (!hasActiveWorkspace) {
    if (!workspaceDebug.loaded && !initialWorkspace.hasWorkspace) {
      return (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 text-sm font-semibold text-[#64748B]">
          Checking workspace session…
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <header className={M.moduleHeaderNavy}>
          <div className={`relative p-1 md:p-2 ${M.dashboardHeroInner}`}>
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#13B5EA]/30 bg-[#13B5EA]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#13B5EA]">
                Xero Integration
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Xero Integration</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                Connect VYRON COST to Xero once an active company workspace is selected.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-800">
                Workspace session fix v3 active
              </p>
              <h2 className="mt-2 text-lg font-bold text-amber-950">No active workspace selected</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-amber-900">
                Xero integration is scoped to your active company workspace. The server could not find a workspace
                cookie — local browser storage alone is not used for security.
              </p>
              <p className="mt-3 text-sm font-medium text-amber-900">To fix this:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm font-medium text-amber-900">
                <li>Log in to your company workspace, or</li>
                <li>Open Developer → Clients and enter a client workspace (platform admin), or</li>
                <li>Return to the Dashboard and confirm the workspace switcher shows your company.</li>
              </ol>
              <div className="mt-5 flex flex-wrap gap-3">
                {showRepairWorkspace ? (
                  <button
                    type="button"
                    onClick={() => void repairWorkspaceSession()}
                    disabled={repairing}
                    className={`${M.primaryBtn} px-4 py-2.5 text-sm disabled:opacity-60`}
                  >
                    {repairing ? "Repairing…" : "Repair Workspace Session"}
                  </button>
                ) : null}
                <Link href="/login" className={`${M.primaryBtn} px-4 py-2.5 text-sm`}>
                  Log in
                </Link>
                <Link href="/developer/clients" className={`${M.secondaryBtn} px-4 py-2.5 text-sm`}>
                  Developer → Clients
                </Link>
                <Link href="/dashboard" className={`${M.secondaryBtn} px-4 py-2.5 text-sm`}>
                  Dashboard
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-700">Local debug</h3>
          <dl className="mt-3 space-y-2 text-sm font-semibold text-slate-800">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">localStorage active client workspaceId</dt>
              <dd className="font-black">{workspaceDebug.localWorkspaceId || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">localStorage companyId</dt>
              <dd className="font-black">{workspaceDebug.localCompanyId || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">document.cookie contains vyron_cost_active_client</dt>
              <dd className="font-black">{workspaceDebug.hasActiveClientCookieDoc ? "yes" : "no"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">document.cookie contains vyron_workspace_user_session</dt>
              <dd className="font-black">{workspaceDebug.hasSessionCookieDoc ? "yes" : "no"}</dd>
            </div>
          </dl>

          <h3 className="mt-5 text-sm font-black uppercase tracking-[0.12em] text-slate-700">Server debug</h3>
          <dl className="mt-3 space-y-2 text-sm font-semibold text-slate-800">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">serverWorkspaceId</dt>
              <dd className="font-black">{workspaceDebug.serverWorkspaceId || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">serverCompanyId</dt>
              <dd className="font-black">{workspaceDebug.serverCompanyId || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">hasWorkspaceCookie</dt>
              <dd className="font-black">{workspaceDebug.hasWorkspaceCookie ? "yes" : "no"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">hasSessionCookie</dt>
              <dd className="font-black">{workspaceDebug.hasSessionCookie ? "yes" : "no"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">status loaded</dt>
              <dd className="font-black">{workspaceDebug.loaded ? "yes" : "no"}</dd>
            </div>
          </dl>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className={M.moduleHeaderNavy}>
        <div className={`relative p-1 md:p-2 ${M.dashboardHeroInner}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#13B5EA]/30 bg-[#13B5EA]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#13B5EA]">
                Xero Integration
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Xero Integration</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                Connect VYRON COST to Xero for accounting-ready customers, suppliers, invoices, purchase bills and sync
                audit visibility.
              </p>
            </div>
            <button type="button" onClick={refresh} className={`shrink-0 ${M.secondaryBtn} px-4 py-2 text-sm`}>
              <RefreshCcw size={16} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            syncErrors.length > 0
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      {syncErrors.length > 0 ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center gap-2 font-bold text-rose-900">
            <AlertTriangle size={18} />
            Sync error centre
          </div>
          <p className="mt-1 text-sm font-medium text-rose-800">
            Failed items remain in the sync queue. Use Retry Failed or retry individual rows below.
          </p>
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm font-medium text-rose-900">
            {syncErrors.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {!oauthReady ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 font-bold text-amber-900">
            <AlertTriangle size={18} />
            Xero OAuth not configured
          </div>
          <p className="mt-2 text-sm font-medium text-amber-900">
            Set the following environment variables on the server before users can connect to Xero:
          </p>
          <ul className="mt-2 space-y-1 text-sm font-bold text-amber-950">
            {REQUIRED_XERO_ENV.map((key) => (
              <li key={key}>
                · {key}
                {missingEnv.includes(key) ? " — missing" : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs font-medium text-amber-800">
            Connect to Xero is disabled until all variables are present. Reconnect and sync actions require OAuth.
          </p>
        </section>
      ) : null}

      {setupWarnings.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 font-bold text-amber-900">
            <AlertTriangle size={18} />
            Setup notes
          </div>
          <ul className="mt-2 space-y-1 text-sm font-medium text-amber-900">
            {setupWarnings.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={M.moduleDataSection}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#0F172A]">Connection status</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Workspace: <span className="font-bold text-[#0F172A]">{displayWorkspaceName}</span>
              {workspaceCtx.companyLinked ? (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  Company linked
                </span>
              ) : (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                  Company not linked
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canConnect ? (
              <>
                {!connection.connected ? (
                  <>
                    <button
                      type="button"
                      onClick={connectXero}
                      disabled={!oauthReady || !hasActiveWorkspace || isConnecting}
                      className={`${M.primaryBtn} px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60`}
                      title={!oauthReady ? "Configure Xero OAuth environment variables first" : undefined}
                    >
                      <Link2 size={16} />
                      {isConnecting
                        ? "Connecting…"
                        : isConnectionError
                          ? "Reconnect to Xero"
                          : isPendingOrganisation
                            ? "Reconnect to Xero"
                            : "Connect to Xero"}
                    </button>
                    {(isConnecting || isConnectionError) ? (
                      <button
                        type="button"
                        onClick={() => void resetConnectionState()}
                        className={`${M.secondaryBtn} px-4 py-2.5 text-sm`}
                      >
                        <RotateCcw size={16} />
                        Clear stale state
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <button type="button" onClick={connectXero} className={`${M.secondaryBtn} px-4 py-2.5 text-sm`}>
                      <RotateCcw size={16} />
                      Reconnect
                    </button>
                    <button
                      type="button"
                      onClick={() => void postConnection("test-connection")}
                      className={`${M.secondaryBtn} px-4 py-2.5 text-sm`}
                    >
                      Test Connection
                    </button>
                    <button
                      type="button"
                      onClick={() => void postConnection("refresh-token")}
                      className={`${M.secondaryBtn} px-4 py-2.5 text-sm`}
                    >
                      Refresh Token
                    </button>
                    <button
                      type="button"
                      onClick={() => void disconnectXero()}
                      className="inline-flex items-center gap-2 rounded-2xl bg-[#0B1220] px-4 py-2.5 text-sm font-bold text-white"
                    >
                      <Unplug size={16} />
                      Disconnect
                    </button>
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoTile label="Status" value={connectionStatus} xero={connection.connected} />
          <InfoTile label="Organisation" value={connection.connected ? connection.organisationName || "—" : "—"} />
          <InfoTile
            label="Connection health"
            value={connection.connectionHealth?.replace(/_/g, " ") || "disconnected"}
          />
          <InfoTile label="Connected user" value={connection.connected ? connection.connectedUser : "—"} />
          <InfoTile label="Connected date" value={formatDate(connection.connectedAt)} />
          <InfoTile label="Last token refresh" value={formatDate(connection.lastTokenRefreshAt || null)} />
          <InfoTile label="Token expires" value={formatDate(connection.tokenExpiresAt || null)} />
          <InfoTile label="Last sync" value={formatDate(connection.lastSyncAt)} />
        </div>

        {isConnecting ? (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
            OAuth redirect in progress. If Xero showed an error or you closed the window, use{" "}
            <span className="font-bold">Clear stale state</span> then <span className="font-bold">Reconnect to Xero</span>.
            Stale connecting state auto-expires after 5 minutes.
          </div>
        ) : null}

        {connection.lastError ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <div className="font-bold">Connection error</div>
            <div className="mt-1 font-medium">{connection.lastError}</div>
            {connection.lastErrorCode ? (
              <div className="mt-1 text-xs font-semibold text-rose-800">Code: {connection.lastErrorCode}</div>
            ) : null}
            {connection.lastAttemptedAt ? (
              <div className="mt-1 text-xs font-semibold text-rose-800">
                Last attempted: {formatDate(connection.lastAttemptedAt)}
              </div>
            ) : null}
          </div>
        ) : null}

        {isPendingOrganisation && connection.availableOrganisations?.length ? (
          <div className="mt-5 rounded-2xl border border-[#7C3AED]/25 bg-[#7C3AED]/8 p-4">
            <h3 className="text-sm font-bold text-[#0F172A]">Select Xero organisation</h3>
            <p className="mt-1 text-xs font-medium text-[#64748B]">
              Multiple organisations were returned. Choose one — sync stays disabled until an organisation is selected.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {connection.availableOrganisations.map((org) => (
                <button
                  key={org.tenantId}
                  type="button"
                  onClick={() => void selectOrganisation(org.tenantId)}
                  className={`${M.primaryBtn} px-4 py-2 text-xs`}
                >
                  {org.tenantName}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className={M.moduleDataSection}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#0F172A]">Sync actions</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Queue and immediately sync to Xero. Customer invoices export as ACCREC in{" "}
              {syncConfig.invoiceStatus || "DRAFT"} status (never auto-approved).
            </p>
            {failedQueueRows.length > 0 ? (
              <p className="mt-2 text-sm font-semibold text-rose-700">
                {failedQueueRows.length} failed item(s) in queue — use Retry Failed or per-row retry.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!syncActionsEnabled || Boolean(bulkBusy)}
              onClick={() => void syncNowAction("sync-all-customers-now")}
              className={`${M.primaryBtn} px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Sync Customers Now
            </button>
            <button
              type="button"
              disabled={!syncActionsEnabled || Boolean(bulkBusy)}
              onClick={() => void syncNowAction("sync-all-suppliers-now")}
              className={`${M.secondaryBtn} px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Sync Suppliers Now
            </button>
            <button
              type="button"
              disabled={!syncActionsEnabled || !invoiceSyncReady || Boolean(bulkBusy)}
              onClick={() => void syncNowAction("sync-all-invoices-now")}
              className={`${M.secondaryBtn} px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50`}
              title={!invoiceSyncReady ? "Map sales account and VAT tax type first" : undefined}
            >
              Sync Invoices Now
            </button>
            <button
              type="button"
              disabled={!syncActionsEnabled || Boolean(bulkBusy)}
              onClick={() => void bulkQueueAction("retry-failed")}
              className={`${M.secondaryBtn} px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Retry Failed
            </button>
            <button
              type="button"
              disabled={!syncActionsEnabled || Boolean(bulkBusy)}
              onClick={() => void bulkQueueAction("cancel-pending")}
              className={`${M.secondaryBtn} px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Cancel Pending
            </button>
          </div>
        </div>
        {!orgSelected && connection.connected ? (
          <p className="mt-3 text-sm font-medium text-amber-800">
            Sync actions are disabled until a Xero organisation is selected.
          </p>
        ) : null}
        {bulkBusy ? (
          <p className="mt-2 text-xs font-semibold text-[#64748B]">Running {bulkBusy.replace(/-/g, " ")}…</p>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={M.moduleDataSection}>
          <h2 className="text-xl font-bold text-[#0F172A]">Sync configuration</h2>
          <p className="mt-1 text-sm font-medium text-[#64748B]">Outbound and inbound sync scope for this workspace.</p>
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#334155]">Outbound to Xero</h3>
              <div className="mt-2 space-y-2">
                {OUTBOUND_SYNC.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-[#334155]">{item.label}</span>
                    {item.supported ? (
                      <input
                        type="checkbox"
                        checked={syncConfig[item.key as keyof XeroSyncConfig] as boolean}
                        disabled={!canEditMapping}
                        onChange={(e) => void saveSyncConfiguration({ [item.key]: e.target.checked })}
                      />
                    ) : (
                      <span className="text-xs font-bold text-[#64748B]">
                        {item.key === "outboundSupplierBills" ? "Blocked — model not ready" : "Coming next"}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#334155]">Inbound from Xero</h3>
              <div className="mt-2 space-y-2">
                {INBOUND_SYNC.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-[#64748B]">{item.label}</span>
                    <span className="text-xs font-bold text-[#64748B]">Coming next</span>
                  </div>
                ))}
              </div>
            </div>
            <label className="block text-sm font-bold text-[#334155]">
              Default invoice status in Xero
              <select
                value={syncConfig.invoiceStatus}
                disabled={!canEditMapping}
                onChange={(e) => void saveSyncConfiguration({ invoiceStatus: e.target.value as "DRAFT" | "SUBMITTED" })}
                className={`${M.select} mt-2 w-full`}
              >
                <option value="DRAFT">DRAFT (recommended — not auto-approved)</option>
                <option value="SUBMITTED">SUBMITTED</option>
              </select>
            </label>
          </div>
        </section>

        <section className={M.moduleDataSection}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[#0F172A]">Account mapping</h2>
              <p className="mt-1 text-sm font-medium text-[#64748B]">
                Sales account and VAT tax type are required before invoice sync runs.
              </p>
            </div>
            {canEditMapping ? (
              <button
                type="button"
                onClick={() => void saveMapping()}
                disabled={savingMapping}
                className={`${M.primaryBtn} px-4 py-2 text-sm`}
              >
                Save mapping
              </button>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {MAPPING_FIELDS.map(({ key, label }) => (
              <label key={key} className="text-xs font-bold text-[#64748B]">
                {label}
                <input
                  value={mapping[key]}
                  disabled={!canEditMapping}
                  onChange={(e) => setMapping((c) => ({ ...c, [key]: e.target.value }))}
                  className={`${M.input} mt-1 w-full`}
                />
              </label>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {mappingPanel.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              >
                <span className="font-medium text-[#334155]">{item.label}</span>
                <span className={`font-bold ${item.ok ? "text-emerald-700" : "text-amber-700"}`}>
                  {item.ok ? "Ready" : "Required"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className={M.moduleDataSection}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#0F172A]">Sync queue</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Company-scoped queue — retry, cancel, and open source records.
            </p>
          </div>
        </div>

        <div className={`mt-4 ${M.tableSurface}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className={VYRON_TABLE.head}>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-left">Counterparty</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Retries</th>
                <th className="px-4 py-3 text-left">Error</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                    Loading sync queue…
                  </td>
                </tr>
              ) : queueRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                    No items in the sync queue. Use Sync Customers Now, Sync Suppliers Now, or Sync Invoices Now above.
                  </td>
                </tr>
              ) : (
                queueRows.map((row) => (
                  <tr key={row.id} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                    <td className="px-4 py-3 font-semibold text-[#7C3AED]">{row.type}</td>
                    <td className="px-4 py-3 font-medium text-[#334155]">{row.reference}</td>
                    <td className="px-4 py-3 text-[#334155]">{row.counterparty}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-[#64748B]">{row.retryCount}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-[#64748B]" title={row.note}>
                      {row.note}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {(row.status === "Ready" || row.status === "Failed") && canSync && orgSelected ? (
                          <button
                            type="button"
                            onClick={() => void syncQueueItem(row.id, row.status === "Failed" ? "retry" : "sync")}
                            className="rounded-lg bg-[#7C3AED] px-2 py-1 text-xs font-bold text-white"
                          >
                            <UploadCloud size={12} className="inline" /> Sync
                          </button>
                        ) : null}
                        {row.status === "Ready" && canSync && orgSelected ? (
                          <button
                            type="button"
                            onClick={() => void syncQueueItem(row.id, "cancel")}
                            className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs font-bold text-[#64748B]"
                          >
                            <XCircle size={12} className="inline" />
                          </button>
                        ) : null}
                        {row.xeroLink ? (
                          <a
                            href={row.xeroLink}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg px-2 py-1 text-xs font-bold text-[#13B5EA]"
                          >
                            <ExternalLink size={12} className="inline" />
                          </a>
                        ) : null}
                        {sourceHref(row) ? (
                          <Link href={sourceHref(row)!} className="rounded-lg px-2 py-1 text-xs font-bold text-[#7C3AED]">
                            Source
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={M.moduleDataSection}>
        <h2 className="text-xl font-bold text-[#0F172A]">Debug / audit trail</h2>
        <p className="mt-1 text-sm font-medium text-[#64748B]">
          Latest OAuth and connection events for this workspace (connect, callback, token exchange, tenants, org
          selection, errors).
        </p>
        <div className={`mt-4 ${M.tableSurface}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className={VYRON_TABLE.head}>
                <th className="px-4 py-3 text-left">When</th>
                <th className="px-4 py-3 text-left">Event</th>
                <th className="px-4 py-3 text-left">Actor</th>
                <th className="px-4 py-3 text-left">Detail</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                    No Xero audit events yet.
                  </td>
                </tr>
              ) : (
                auditEvents.map((event, index) => <AuditRow key={`${event.at}-${index}`} event={event} />)
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function sourceHref(row: QueueRow) {
  if (row.type === "Customer Invoice") return `/customer-invoices/${encodeURIComponent(row.reference)}`;
  if (row.type === "Customer") return "/customers";
  if (row.type === "Supplier") return "/suppliers";
  return null;
}

function InfoTile({ label, value, xero }: { label: string; value: string; xero?: boolean }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">{label}</div>
      <div className={`mt-1 break-words text-sm font-bold ${xero ? "text-[#13B5EA]" : "text-[#0F172A]"}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: XeroSyncStatus }) {
  const classes: Record<string, string> = {
    Ready: "border-[#7C3AED]/25 bg-[#7C3AED]/10 text-[#7C3AED]",
    Synced: "border-emerald-200 bg-emerald-50 text-emerald-700",
    Failed: "border-rose-200 bg-rose-50 text-rose-700",
    "Needs Review": "border-amber-200 bg-amber-50 text-amber-800",
    Processing: "border-blue-200 bg-blue-50 text-blue-700",
    Cancelled: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${classes[status] || classes.Ready}`}>
      {status}
    </span>
  );
}

function AuditRow({ event }: { event: XeroAuditEvent }) {
  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3 text-xs font-medium text-[#64748B]">{formatDate(event.at)}</td>
      <td className="px-4 py-3 font-semibold text-[#334155]">{formatAuditEvent(event.event)}</td>
      <td className="px-4 py-3 text-[#64748B]">{event.actor || "—"}</td>
      <td className="px-4 py-3 text-[#334155]">{event.detail || "—"}</td>
    </tr>
  );
}

function formatAuditEvent(event: string) {
  return event.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
