"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Link2,
  RefreshCcw,
  Server,
  Shield,
  XCircle,
} from "lucide-react";
import { VYRON_MASTER } from "@/components/vyron-ui";

const M = VYRON_MASTER;

type ApiReport = {
  ok: boolean;
  environment: {
    nodeEnv: string;
    supabaseUrl: boolean;
    supabaseAnonKey: boolean;
    supabaseServiceRole: boolean;
    xeroClientId: boolean;
    xeroClientSecret: boolean;
    xeroRedirectUri: boolean;
  };
  workspace: {
    hasActiveWorkspace: boolean;
    workspaceId: string | null;
    workspaceName: string | null;
  };
  company: {
    hasCompany: boolean;
    companyId: string | null;
    companyName: string | null;
  };
  executionPersistence: {
    mode: "database" | "memory" | "unavailable";
    tableReady: boolean;
    warning: string | null;
  };
  migrations: Array<{
    id: string;
    label: string;
    file: string;
    applied: boolean;
    detail: string | null;
  }>;
  xero: {
    oauthReady: boolean;
    connected: boolean;
    status: string;
    organisationName: string | null;
    missingEnvVars: string[];
  };
  build: {
    isProduction: boolean;
    warnings: string[];
  };
  warnings: string[];
  error?: string;
};

function StatusPill({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${
        ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
      }`}
    >
      {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {label || (ok ? "Configured" : "Missing")}
    </span>
  );
}

function CheckRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string | null }) {
  return (
    <div className="flex flex-col gap-2 border-b border-[#E2E8F0] py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-bold text-[#0F172A]">{label}</div>
        {detail ? <div className="mt-1 text-xs font-medium text-[#64748B]">{detail}</div> : null}
      </div>
      <StatusPill ok={ok} />
    </div>
  );
}

export default function DeploymentReadinessClient() {
  const [report, setReport] = useState<ApiReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/deployment-readiness")
      .then((r) => r.json())
      .then((data: ApiReport) => {
        if (data.error) throw new Error(data.error);
        setReport(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const overallReady = report?.ok && (report.warnings?.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <header className={M.moduleHeaderNavy}>
        <div className={`relative p-1 md:p-2 ${M.dashboardHeroInner}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#F43F5E]/35 bg-[#F43F5E]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#FECDD3]">
                Deployment
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Deployment Readiness</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                Production environment checklist — configuration status only. Secret values are never displayed.
              </p>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className={`${M.secondaryBtn} px-4 py-2 text-sm disabled:opacity-60`}
            >
              <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      {loading && !report ? (
        <section className={M.moduleDataSection}>
          <p className="text-sm font-medium text-[#64748B]">Running deployment checks…</p>
        </section>
      ) : null}

      {report ? (
        <>
          <section
            className={`rounded-2xl border px-5 py-4 ${
              overallReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="flex items-start gap-3">
              {overallReady ? (
                <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-700" />
              ) : (
                <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-700" />
              )}
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">
                  {overallReady ? "Ready for deployment" : "Deployment attention required"}
                </h2>
                <p className="mt-1 text-sm font-medium text-[#475569]">
                  Environment: <strong>{report.environment.nodeEnv}</strong>
                  {report.build.isProduction ? " (production)" : " (non-production)"}
                </p>
              </div>
            </div>
          </section>

          {report.warnings.length > 0 ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-rose-900">
                <AlertTriangle size={20} />
                Warnings
              </h2>
              <ul className="mt-3 space-y-2">
                {report.warnings.map((warning) => (
                  <li key={warning} className="text-sm font-medium text-rose-800">
                    · {warning}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className={M.moduleDataSection}>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#0F172A]">
                <Server size={20} className="text-[#7C3AED]" />
                Environment
              </h2>
              <div className="mt-4">
                <CheckRow label="Supabase URL (NEXT_PUBLIC_SUPABASE_URL)" ok={report.environment.supabaseUrl} />
                <CheckRow label="Supabase anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY)" ok={report.environment.supabaseAnonKey} />
                <CheckRow
                  label="Supabase service role (SUPABASE_SERVICE_ROLE_KEY)"
                  ok={report.environment.supabaseServiceRole}
                  detail="Required for server-side persistence and migrations verification."
                />
                <CheckRow label="Xero client ID (XERO_CLIENT_ID)" ok={report.environment.xeroClientId} />
                <CheckRow label="Xero client secret (XERO_CLIENT_SECRET)" ok={report.environment.xeroClientSecret} />
                <CheckRow label="Xero redirect URI (XERO_REDIRECT_URI)" ok={report.environment.xeroRedirectUri} />
              </div>
            </section>

            <section className={M.moduleDataSection}>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#0F172A]">
                <Link2 size={20} className="text-[#7C3AED]" />
                Workspace &amp; Company
              </h2>
              <div className="mt-4">
                <CheckRow
                  label="Active workspace"
                  ok={report.workspace.hasActiveWorkspace}
                  detail={
                    report.workspace.workspaceName
                      ? `${report.workspace.workspaceName}${report.workspace.workspaceId ? ` · ${report.workspace.workspaceId}` : ""}`
                      : "Select a client workspace from Developer → Clients or log in to a company workspace."
                  }
                />
                <CheckRow
                  label="Current company"
                  ok={report.company.hasCompany}
                  detail={
                    report.company.companyName
                      ? `${report.company.companyName}${report.company.companyId ? ` · ${report.company.companyId}` : ""}`
                      : "No company linked to the active workspace."
                  }
                />
              </div>
            </section>

            <section className={M.moduleDataSection}>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#0F172A]">
                <Database size={20} className="text-[#7C3AED]" />
                Required migrations
              </h2>
              <div className="mt-4">
                {report.migrations.map((migration) => (
                  <CheckRow
                    key={migration.id}
                    label={`${migration.label} (${migration.file})`}
                    ok={migration.applied}
                    detail={migration.detail}
                  />
                ))}
              </div>
            </section>

            <section className={M.moduleDataSection}>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#0F172A]">
                <Shield size={20} className="text-[#7C3AED]" />
                Integrations &amp; persistence
              </h2>
              <div className="mt-4">
                <CheckRow
                  label="Execution actions persistence"
                  ok={report.executionPersistence.mode === "database"}
                  detail={
                    report.executionPersistence.warning ||
                    `Mode: ${report.executionPersistence.mode}${report.executionPersistence.tableReady ? " · table ready" : ""}`
                  }
                />
                <CheckRow
                  label="Xero OAuth readiness"
                  ok={report.xero.oauthReady}
                  detail={
                    report.xero.missingEnvVars.length > 0
                      ? `Missing: ${report.xero.missingEnvVars.join(", ")}`
                      : "All Xero OAuth environment variables are set."
                  }
                />
                <CheckRow
                  label="Xero connection"
                  ok={report.xero.connected}
                  detail={
                    report.xero.connected
                      ? `${report.xero.status}${report.xero.organisationName ? ` · ${report.xero.organisationName}` : ""}`
                      : report.xero.status
                  }
                />
              </div>
            </section>
          </div>

          {report.build.warnings.length > 0 ? (
            <section className={M.moduleDataSection}>
              <h2 className="text-lg font-bold text-[#0F172A]">Build &amp; deployment notes</h2>
              <ul className="mt-3 space-y-2">
                {report.build.warnings.map((warning) => (
                  <li key={warning} className="text-sm font-medium text-[#475569]">
                    · {warning}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
