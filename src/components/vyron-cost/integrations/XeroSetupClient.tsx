"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, RefreshCcw, Settings, Unplug } from "lucide-react";
import { readActiveClient } from "@/lib/vyron-developer-client";
import {
  DEFAULT_XERO_ACCOUNT_MAPPING,
  type XeroAccountMapping,
  type XeroConnectionState,
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
  const mappingRef = useRef<HTMLElement>(null);
  const [clientId, setClientId] = useState("default");
  const [connection, setConnection] = useState<XeroConnectionState>(defaultXeroConnection());
  const [mapping, setMapping] = useState<XeroAccountMapping>(DEFAULT_XERO_ACCOUNT_MAPPING);
  const [message, setMessage] = useState<string | null>(null);
  const [oauthReady, setOauthReady] = useState(false);

  const refresh = useCallback(() => {
    const active = readActiveClient();
    const workspaceId = active?.id || "default";
    setClientId(workspaceId);

    fetch(`/api/integrations/xero/connection?clientId=${encodeURIComponent(workspaceId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setConnection(d.connection);
          setOauthReady(Boolean(d.oauthReady));
        }
      })
      .catch(() => {});

    fetch(`/api/integrations/xero/mapping?clientId=${encodeURIComponent(workspaceId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.mapping) setMapping(d.mapping);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function connectXero() {
    const active = readActiveClient();
    const res = await fetch("/api/integrations/xero/connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "connect",
        clientId: active?.id || "default",
        organisationName: active?.companyName || "Handcrafted Food Products (Pty) Ltd",
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      setMessage(data.error || "Connection failed.");
      return;
    }
    setConnection(data.connection);
    setMessage(oauthReady ? "Xero OAuth flow ready — demo connection established for this workspace." : "Demo Xero connection saved for this workspace.");
    refresh();
  }

  async function disconnectXero() {
    const res = await fetch("/api/integrations/xero/connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect", clientId }),
    });
    const data = await res.json();
    if (data.ok) {
      setConnection(data.connection || defaultXeroConnection());
      setMessage("Disconnected from Xero for this workspace.");
    }
  }

  async function saveMapping() {
    const res = await fetch("/api/integrations/xero/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, mapping }),
    });
    const data = await res.json();
    setMessage(data.ok ? "Account mapping saved for active workspace." : data.error || "Save failed.");
  }

  function scrollToMapping() {
    mappingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const active = readActiveClient();

  return (
    <div className="space-y-6">
      {active ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">
          Mapping and connection scoped to workspace: <span className="font-black">{active.companyName}</span>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          No active client workspace — connection and mapping will use the default platform profile until Login As Client is used.
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
            {!connection.connected ? (
              <button
                type="button"
                onClick={() => void connectXero()}
                className="inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white"
              >
                <Link2 size={16} />
                Connect Xero
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void disconnectXero()}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white"
              >
                <Unplug size={16} />
                Disconnect Xero
              </button>
            )}
            <button
              type="button"
              onClick={scrollToMapping}
              className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800"
            >
              <Settings size={16} />
              Setup Mapping
            </button>
            <Link
              href="/integrations/xero/sync-centre"
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white"
            >
              <ExternalLink size={16} />
              Open Sync Centre
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoTile label="Connection Status" value={connection.connected ? "Connected" : "Not Connected"} highlight={connection.connected} />
          <InfoTile label="Organisation Name" value={connection.organisationName} />
          <InfoTile label="Tenant ID" value={connection.tenantId} />
          <InfoTile label="Connected User" value={connection.connectedUser} />
          <InfoTile label="Connected Date" value={formatDate(connection.connectedAt)} />
          <InfoTile label="Last Sync" value={formatDate(connection.lastSyncAt)} />
        </div>

        {oauthReady ? (
          <p className="mt-4 text-xs font-semibold text-emerald-700">
            OAuth credentials detected — configure XERO_REDIRECT_URI to your deployed /api/integrations/xero/callback endpoint.
          </p>
        ) : (
          <p className="mt-4 text-xs font-semibold text-slate-500">
            Demo mode active. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET and XERO_REDIRECT_URI in Vercel for live OAuth.
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
          <button
            type="button"
            onClick={() => void saveMapping()}
            className="inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white"
          >
            Save Mapping
          </button>
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

function InfoTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-emerald-200 bg-emerald-50" : "border-slate-100 bg-slate-50"}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mt-2 text-sm font-black ${highlight ? "text-emerald-800" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-ZA");
}
