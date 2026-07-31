"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Link2, RefreshCcw, Settings, Unplug } from "lucide-react";
import { readActiveClient, type ActiveClient } from "@/lib/vyron-developer-client";
import { useXeroPermissions } from "@/hooks/useModulePermissions";
import {
  DEFAULT_XERO_ACCOUNT_MAPPING,
  type XeroAccountMapping,
  type XeroConnectionState,
  type XeroConnectionStatus,
  defaultXeroConnection,
} from "@/lib/vyron-xero-integration";

const MAPPING_FIELDS: Array<{ key: keyof XeroAccountMapping; label: string }> = [
  { key: "salesAccount", label: "Sales Account" },
  { key: "costOfSalesAccount", label: "Cost of Sales Account" },
  { key: "inventoryAssetAccount", label: "Inventory Asset Account" },
  { key: "packagingAccount", label: "Packaging Account" },
  { key: "manufacturingVarianceAccount", label: "Manufacturing Variance Account" },
  { key: "stockAdjustmentAccount", label: "Stock Adjustment Account" },
  { key: "vatStandard", label: "VAT Standard" },
  { key: "zeroRated", label: "Zero Rated" },
  { key: "exempt", label: "Exempt" },
];

export default function XeroSetupClient() {
  const { canConnect, canEditMapping, canView } = useXeroPermissions();
  const searchParams = useSearchParams();
  const mappingRef = useRef<HTMLElement>(null);
  const [connection, setConnection] = useState<XeroConnectionState>(defaultXeroConnection());
  const [mapping, setMapping] = useState<XeroAccountMapping>(DEFAULT_XERO_ACCOUNT_MAPPING);
  const [message, setMessage] = useState<string | null>(null);
  const [oauthReady, setOauthReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<ActiveClient | null>(null);

  const refresh = useCallback(() => {
    const currentActive = readActiveClient();
    setActive(currentActive);
    if (!currentActive?.id) {
      setConnection(defaultXeroConnection());
      return;
    }

    fetch("/api/integrations/xero/connection")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setConnection(d.connection);
          setOauthReady(Boolean(d.oauthReady));
        }
      })
      .catch(() => {});

    fetch("/api/integrations/xero/mapping")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.mapping) setMapping(d.mapping);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setMounted(true);
    setActive(readActiveClient());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    refresh();
  }, [mounted, refresh]);

  useEffect(() => {
    const xeroStatus = searchParams.get("xero");
    const callbackMessage = searchParams.get("message");
    if (!xeroStatus) return;

    if (callbackMessage) {
      setMessage(callbackMessage);
    } else if (xeroStatus === "connected") {
      setMessage("Xero connected successfully.");
    } else if (xeroStatus === "select-org") {
      setMessage(callbackMessage || "Select the Xero organisation for this workspace.");
    }

    refresh();
  }, [searchParams, refresh]);

  function connectXero() {
    if (!canConnect) {
      setMessage("You do not have permission to connect Xero.");
      return;
    }
    if (!active?.id) {
      setMessage("Select a client workspace before connecting Xero.");
      return;
    }

    if (!oauthReady) {
      setMessage("Xero OAuth is not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET and XERO_REDIRECT_URI.");
      return;
    }

    setConnection((current) => ({ ...current, status: "Connecting", connected: false }));
    window.location.href = "/api/integrations/xero/connect";
  }

  async function selectOrganisation(tenantId: string) {
    if (!canConnect) {
      setMessage("You do not have permission to connect Xero.");
      return;
    }
    const res = await fetch("/api/integrations/xero/connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "select-organisation", tenantId }),
    });
    const data = await res.json();
    if (data.ok) {
      setConnection(data.connection);
      setMessage(`Connected to ${data.connection?.organisationName || "Xero organisation"}.`);
    } else {
      setMessage(data.error || "Could not save organisation selection.");
    }
  }

  async function disconnectXero() {
    if (!canConnect) {
      setMessage("You do not have permission to disconnect Xero.");
      return;
    }
    const res = await fetch("/api/integrations/xero/connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    const data = await res.json();
    if (data.ok) {
      setConnection(data.connection || defaultXeroConnection());
      setMessage("Disconnected from Xero for this workspace.");
    }
  }

  async function saveMapping() {
    if (!canEditMapping) {
      setMessage("You do not have permission to edit Xero mapping.");
      return;
    }
    const res = await fetch("/api/integrations/xero/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping }),
    });
    const data = await res.json();
    setMessage(data.ok ? "Account mapping saved for active workspace." : data.error || "Save failed.");
  }

  function scrollToMapping() {
    mappingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const connectionStatus = connection.status || (connection.connected ? "Connected" : "Not Connected");
  const isConnecting = connectionStatus === "Connecting";

  return (
    <div className="space-y-6">
      {!mounted ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500">
          Loading workspace...
        </div>
      ) : active ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">
          Mapping and connection scoped to workspace: <span className="font-black">{active.companyName}</span>
        </div>
      ) : (
        <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm font-bold text-fuchsia-800">
          No active client workspace — select a workspace before connecting Xero.
        </div>
      )}

      {message ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">{message}</div>
      ) : null}

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-950">Xero Connection</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              VYRON COST sends approved accounting-ready transactions to Xero. Xero remains the ledger.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {connectionStatus !== "Connected" && canConnect ? (
              <button
                type="button"
                onClick={connectXero}
                disabled={isConnecting}
                className="inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Link2 size={16} />
                {isConnecting ? "Connecting…" : "Connect Xero"}
              </button>
            ) : connectionStatus === "Connected" && canConnect ? (
              <button
                type="button"
                onClick={() => void disconnectXero()}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white"
              >
                <Unplug size={16} />
                Disconnect Xero
              </button>
            ) : null}
            <button
              type="button"
              onClick={scrollToMapping}
              className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800"
            >
              <Settings size={16} />
              Setup Mapping
            </button>
            {canView ? (
              <Link
                href="/integrations/xero/sync-centre"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#24183F] border border-[#A855F7]/30 px-5 py-3 text-sm font-black text-white"
              >
                <ExternalLink size={16} />
                Open Sync Centre
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoTile label="Connection Status" value={connectionStatus} highlight={connectionStatus === "Connected"} status={connectionStatus} />
          <InfoTile label="Organisation Name" value={connection.connected ? connection.organisationName : "—"} />
          <InfoTile label="Tenant ID" value={connection.connected ? connection.tenantId : "—"} />
          <InfoTile label="Connected User" value={connection.connected ? connection.connectedUser : "—"} />
          <InfoTile label="Connected Date" value={formatDate(connection.connectedAt)} />
          <InfoTile label="Last Sync" value={formatDate(connection.lastSyncAt)} />
        </div>

        {connection.pendingOrganisationSelection && connection.availableOrganisations?.length ? (
          <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <h3 className="text-sm font-black text-violet-900">Select Xero Organisation</h3>
            <p className="mt-1 text-xs font-semibold text-violet-700">
              Multiple organisations were returned. Choose which Xero organisation belongs to this workspace.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {connection.availableOrganisations.map((org) => (
                <button
                  key={org.tenantId}
                  type="button"
                  onClick={() => void selectOrganisation(org.tenantId)}
                  className="rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-white"
                >
                  {org.tenantName}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {oauthReady ? (
          <p className="mt-4 text-xs font-semibold text-[#7E22CE]">
            Xero OAuth is configured. Connect Xero redirects to login.xero.com for real authorisation.
          </p>
        ) : (
          <p className="mt-4 text-xs font-semibold text-fuchsia-700">
            Set XERO_CLIENT_ID, XERO_CLIENT_SECRET and XERO_REDIRECT_URI to enable live Xero OAuth.
          </p>
        )}
      </section>

      <section
        ref={mappingRef}
        className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-950">Account Mapping</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Saved per active client workspace for Xero posting.</p>
          </div>
          {canEditMapping ? (
            <button
              type="button"
              onClick={() => void saveMapping()}
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white"
            >
              Save Mapping
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {MAPPING_FIELDS.map(({ key, label }) => (
            <label key={key} className="text-sm font-black text-slate-600">
              {label}
              <input
                value={mapping[key]}
                onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
              />
            </label>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800"
        >
          <RefreshCcw size={16} />
          Refresh
        </button>
        <Link href="/integrations/xero" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">
          Back to Xero Integration
        </Link>
      </div>
    </div>
  );
}

function InfoTile({
  label,
  value,
  highlight,
  status,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  status?: XeroConnectionStatus;
}) {
  const statusClass =
    status === "Connecting"
      ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800"
      : highlight
        ? "border-[#A855F7]/25 bg-[#A855F7]/10 text-[#4D7C0F]"
        : "border-slate-100 bg-slate-50 text-slate-900";

  return (
    <div className={`rounded-2xl border p-4 ${statusClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mt-2 text-sm font-black ${status === "Connecting" ? "text-fuchsia-800" : highlight ? "text-[#4D7C0F]" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-ZA");
}
