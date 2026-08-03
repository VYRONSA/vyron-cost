"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  Eye,
  HardDriveDownload,
  Loader2,
  Lock,
  RefreshCcw,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";

/**
 * PCP-045 / PCP-045A — Developer Supervisor Reset Centre (client shell).
 *
 * This component collects input and renders results. It holds no delete logic
 * and no table list of its own: every count, verdict and row it shows comes from
 * the server. The supervisor password lives in component state only for the
 * duration of a request and is never persisted.
 */

type ResetModule = { key: string; label: string; summary: string };

const MODULES: ResetModule[] = [
  {
    key: "supplier_invoices",
    label: "Reset Supplier Invoices",
    summary: "Documents, invoice headers and lines, extraction results, review drafts, learning records, risk findings.",
  },
  {
    key: "raw_materials",
    label: "Reset Raw Materials",
    summary: "Ingredients, stock items, stock ledger and counts, price history and movements.",
  },
  {
    key: "finished_goods",
    label: "Reset Finished Goods",
    summary: "Products, finished goods, product cost lines, product intelligence, recipe links.",
  },
  {
    key: "boms",
    label: "Reset BOMs",
    summary: "BOM headers, BOM versions, BOM lines, recipes, recipe items.",
  },
  {
    key: "production_history",
    label: "Reset Production History",
    summary: "Production runs and lines, labour, overhead, wastage, production audit trail.",
  },
  {
    key: "suppliers",
    label: "Reset Suppliers",
    summary: "Suppliers, supplier profiles, contracts, and everything referencing them.",
  },
];

const FACTORY: ResetModule = {
  key: "factory",
  label: "Factory Reset Costing",
  summary: "Every module above, in dependency order, in one transaction.",
};

type Company = { id: string; name: string; tradingName: string; status: string };
type PreviewRow = { table_name: string; row_count: number };

type BackupReport = {
  location: string;
  createdAt: string;
  module: string;
  tables: number;
  rows: number;
  bytes: number;
  durationMs: number;
};

type BackupStatus =
  | { exists: false; writable: boolean; reason?: string }
  | { exists: true; writable: boolean; report: BackupReport };

type HealthCheck = { key: string; label: string; ok: boolean; detail: string };

type AuditRow = {
  id: string;
  module: string;
  actor_email: string | null;
  reason: string | null;
  total_rows_deleted: number;
  duration_ms: number | null;
  status: string;
  created_at: string;
};

type Validation = {
  clean: boolean;
  headline: Array<{ label: string; table: string; rows: number }>;
  remaining: PreviewRow[];
  orphanRecords: number;
};

type ExecuteResult = {
  module: string;
  backup: { created: boolean; location: string | null; acknowledgedWithout: boolean };
  rowsDeleted: Record<string, number>;
  totalRowsDeleted: number;
  durationMs: number;
  validation: Validation;
  warnings: string[];
};

const CONFIRMATION_PHRASE = "DELETE";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DeveloperResetCentreClient() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");

  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ module: string; rows: PreviewRow[]; total: number; token: string } | null>(
    null
  );
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [result, setResult] = useState<ExecuteResult | null>(null);

  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [freshBackup, setFreshBackup] = useState<BackupReport | null>(null);
  const [ackNoBackup, setAckNoBackup] = useState(false);
  const [ackIrreversible, setAckIrreversible] = useState(false);

  const [health, setHealth] = useState<{ ready: boolean; checks: HealthCheck[] } | null>(null);

  const [busy, setBusy] = useState<"preview" | "backup" | "health" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialogFor, setConfirmDialogFor] = useState<ResetModule | null>(null);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === companyId) || null,
    [companies, companyId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/developer/reset-centre/companies");
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error || "Could not load companies.");
          return;
        }
        setCompanies(json.companies || []);
      } catch {
        if (!cancelled) setError("Could not load companies.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Changing the target invalidates everything downstream of it. */
  const selectCompany = useCallback((nextId: string) => {
    setCompanyId(nextId);
    setPreview(null);
    setResult(null);
    setConfirmation("");
    setError(null);
    setBackupStatus(null);
    setFreshBackup(null);
    setHealth(null);
    setAckNoBackup(false);
    setAckIrreversible(false);
  }, []);

  const runPreview = useCallback(
    async (moduleKey: string) => {
      setError(null);
      setResult(null);
      setHealth(null);
      setFreshBackup(null);
      setBusy("preview");
      setActiveModule(moduleKey);
      try {
        const res = await fetch("/api/developer/reset-centre/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, module: moduleKey, password }),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error || "Preview failed.");
          setPreview(null);
          return;
        }
        setPreview({
          module: moduleKey,
          rows: json.rows || [],
          total: json.totalRows || 0,
          token: json.previewToken || "",
        });
        setAudit(json.audit || []);
        setBackupStatus(json.backup || null);
      } catch {
        setError("Preview request failed.");
      } finally {
        setBusy(null);
      }
    },
    [companyId, password]
  );

  const runBackup = useCallback(async () => {
    if (!preview) return;
    setError(null);
    setBusy("backup");
    try {
      const res = await fetch("/api/developer/reset-centre/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, module: preview.module, password }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Backup failed.");
        return;
      }
      setFreshBackup(json.backup);
      setBackupStatus({ exists: true, writable: true, report: json.backup });
      setHealth(null);
    } catch {
      setError("Backup request failed.");
    } finally {
      setBusy(null);
    }
  }, [companyId, password, preview]);

  const backupLocation = freshBackup?.location || (backupStatus?.exists ? backupStatus.report.location : "");

  const runHealth = useCallback(async () => {
    if (!preview) return null;
    setError(null);
    setBusy("health");
    try {
      const res = await fetch("/api/developer/reset-centre/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          module: preview.module,
          password,
          previewToken: preview.token,
          backupLocation,
          acknowledgedNoBackup: ackNoBackup && ackIrreversible,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Health check failed.");
        return null;
      }
      setHealth({ ready: json.ready, checks: json.checks || [] });
      return json.ready as boolean;
    } catch {
      setError("Health check request failed.");
      return null;
    } finally {
      setBusy(null);
    }
  }, [companyId, password, preview, backupLocation, ackNoBackup, ackIrreversible]);

  const runExecute = useCallback(
    async (moduleKey: string) => {
      if (!preview) return;
      setError(null);
      setBusy("execute");
      try {
        const res = await fetch("/api/developer/reset-centre/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            module: moduleKey,
            password,
            confirmation,
            reason,
            previewToken: preview.token,
            backupLocation,
            acknowledgedNoBackup: ackNoBackup,
            acknowledgedIrreversible: ackIrreversible,
          }),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error || "Reset failed.");
          return;
        }
        setResult({
          module: json.module,
          backup: json.backup,
          rowsDeleted: json.rowsDeleted || {},
          totalRowsDeleted: json.totalRowsDeleted || 0,
          durationMs: json.durationMs || 0,
          validation: json.validation,
          warnings: json.warnings || [],
        });
        setPreview(null);
        setConfirmation("");
        setHealth(null);
      } catch {
        setError("Reset request failed.");
      } finally {
        setBusy(null);
        setConfirmDialogFor(null);
      }
    },
    [companyId, password, confirmation, reason, preview, backupLocation, ackNoBackup, ackIrreversible]
  );

  const canPreview = Boolean(companyId && password) && busy === null;
  const backupSatisfied = Boolean(backupLocation) || (ackNoBackup && ackIrreversible);
  const canExecute =
    canPreview && confirmation === CONFIRMATION_PHRASE && preview !== null && preview.total > 0 && backupSatisfied;

  return (
    <div className="w-full max-w-full min-w-0 space-y-6 overflow-x-hidden p-6">
      {/* ------------------------------------------------ danger banner */}
      <div className="w-full rounded-[2rem] border-2 border-red-300 bg-red-50 p-6 shadow-[0_18px_50px_rgba(190,18,60,0.10)]">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-red-600 p-3 text-white">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-red-900">Developer Supervisor Reset Centre</h1>
            <p className="mt-1 text-sm font-semibold text-red-700">
              Permanently deletes operational costing data for a single company. Deletions cannot be undone from
              this screen — recovery requires the backup taken below. Every action is scoped to one company ID and
              recorded in the audit trail.
            </p>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-red-600">
              Users, authentication, permissions, settings, financial accounts and shared reference data are never
              touched.
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ credentials */}
      <div className="w-full rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h2 className="text-lg font-black text-slate-900">1 &nbsp;Target and authorisation</h2>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Company</span>
            <select
              value={companyId}
              onChange={(e) => selectCompany(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800"
            >
              <option value="">Select a company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.tradingName ? ` — ${c.tradingName}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Developer supervisor password
            </span>
            <div className="relative mt-1">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                placeholder="Required for every action"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-800"
              />
            </div>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Reason (recorded in the audit trail)
          </span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Rebuilding costing data before the new supplier import"
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800"
          />
        </label>

        {selectedCompany ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Target</p>
            <p className="mt-1 font-black text-slate-900">{selectedCompany.name}</p>
            {selectedCompany.tradingName ? (
              <p className="text-sm font-semibold text-slate-600">t/a {selectedCompany.tradingName}</p>
            ) : null}
            <p className="mt-1 font-mono text-xs text-slate-500">{selectedCompany.id}</p>
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------ modules */}
      <div className="w-full rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h2 className="text-lg font-black text-slate-900">2 &nbsp;Choose a module, then preview</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Preview is read-only and always required before a reset is allowed.
        </p>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {MODULES.map((m) => (
            <ModuleCard
              key={m.key}
              module={m}
              active={activeModule === m.key}
              disabled={!canPreview}
              busy={busy === "preview" && activeModule === m.key}
              onPreview={() => runPreview(m.key)}
            />
          ))}
        </div>

        <div className="mt-4 rounded-2xl border-2 border-red-200 bg-red-50/60 p-4">
          <ModuleCard
            module={FACTORY}
            active={activeModule === FACTORY.key}
            disabled={!canPreview}
            busy={busy === "preview" && activeModule === FACTORY.key}
            onPreview={() => runPreview(FACTORY.key)}
            danger
          />
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm font-semibold text-red-800">{error}</p>
        </div>
      ) : null}

      {/* ------------------------------------------------ preview */}
      {preview ? (
        <>
          <div className="w-full rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">3 &nbsp;This will be deleted</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {labelFor(preview.module)} — {preview.rows.length} table
                  {preview.rows.length === 1 ? "" : "s"}, {preview.total.toLocaleString()} rows
                </p>
              </div>
              <button
                type="button"
                onClick={() => runPreview(preview.module)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-600 hover:bg-slate-50"
              >
                <RefreshCcw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>

            {preview.total === 0 ? (
              <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                Nothing to delete — this company already has no rows in scope for this module.
              </p>
            ) : (
              <div className="mt-5 max-h-72 overflow-y-auto rounded-2xl border border-slate-100">
                <table className="w-full text-sm">
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.table_name} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.table_name}</td>
                        <td className="px-4 py-2 text-right font-black tabular-nums text-slate-900">
                          {r.row_count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ------------------------------------------------ backup */}
          {preview.total > 0 ? (
            <div className="w-full rounded-[2rem] border-2 border-sky-200 bg-white p-6 shadow-[0_18px_50px_rgba(2,132,199,0.10)]">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-sky-600 p-3 text-white">
                  <Archive className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black text-slate-900">4 &nbsp;Database backup</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Captures exactly the rows this module would delete. Creating a backup is the preferred path.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Last backup</p>
                  {backupStatus?.exists ? (
                    <>
                      <p className="mt-1 font-black text-slate-900">
                        {new Date(backupStatus.report.createdAt).toLocaleString()}
                      </p>
                      <p className="text-sm font-semibold text-slate-600">{selectedCompany?.name}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{backupStatus.report.location}</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-xl font-black text-red-700">Never</p>
                      {backupStatus && !backupStatus.writable ? (
                        <p className="mt-1 text-xs font-semibold text-amber-700">{backupStatus.reason}</p>
                      ) : null}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={runBackup}
                  className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-sky-600 px-8 text-sm font-black uppercase tracking-[0.1em] text-white shadow-lg transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  {busy === "backup" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Backing up…
                    </>
                  ) : (
                    <>
                      <HardDriveDownload className="h-4 w-4" /> Create backup
                    </>
                  )}
                </button>
              </div>

              {freshBackup ? (
                <div className="mt-5 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <p className="font-black text-emerald-900">Backup complete</p>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <Stat label="Tables" value={freshBackup.tables.toLocaleString()} />
                    <Stat label="Rows" value={freshBackup.rows.toLocaleString()} />
                    <Stat label="Size" value={formatBytes(freshBackup.bytes)} />
                    <Stat label="Duration" value={`${(freshBackup.durationMs / 1000).toFixed(1)} sec`} />
                  </div>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Location</p>
                  <p className="font-mono text-xs text-emerald-900">{freshBackup.location}</p>
                </div>
              ) : null}

              <div className="mt-5 space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-600">
                  Or proceed without a backup by acknowledging both statements:
                </p>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={ackNoBackup}
                    onChange={(e) => {
                      setAckNoBackup(e.target.checked);
                      setHealth(null);
                    }}
                    className="mt-0.5 h-4 w-4 accent-red-600"
                  />
                  <span className="text-sm font-semibold text-slate-700">I understand no backup exists.</span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={ackIrreversible}
                    onChange={(e) => {
                      setAckIrreversible(e.target.checked);
                      setHealth(null);
                    }}
                    className="mt-0.5 h-4 w-4 accent-red-600"
                  />
                  <span className="text-sm font-semibold text-slate-700">I accept this reset cannot be undone.</span>
                </label>
              </div>
            </div>
          ) : null}

          {/* ------------------------------------------------ execute */}
          {preview.total > 0 ? (
            <div className="w-full rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <h2 className="text-lg font-black text-slate-900">5 &nbsp;Verify and execute</h2>

              {health ? (
                <div
                  className={`mt-4 rounded-2xl border-2 p-4 ${
                    health.ready ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
                  }`}
                >
                  <p className={`font-black ${health.ready ? "text-emerald-900" : "text-red-900"}`}>
                    {health.ready ? "Ready to Reset" : "Cannot Continue"}
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {health.checks.map((c) => (
                      <div key={c.key} className="flex items-start gap-2">
                        {c.ok ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                        )}
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-slate-800">{c.label}</span>
                          <span className="ml-2 text-xs font-semibold text-slate-500">{c.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Type {CONFIRMATION_PHRASE} to enable the reset
                  </span>
                  <input
                    type="text"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="off"
                    placeholder={CONFIRMATION_PHRASE}
                    className="mt-1 w-full rounded-2xl border-2 border-red-200 bg-red-50/50 px-4 py-3 font-black tracking-[0.2em] text-red-900"
                  />
                </label>

                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={runHealth}
                  className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 px-6 text-xs font-black uppercase tracking-[0.1em] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === "health" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                  Run health check
                </button>

                <button
                  type="button"
                  disabled={!canExecute || busy !== null}
                  onClick={async () => {
                    const ready = await runHealth();
                    if (!ready) return;
                    const m = [...MODULES, FACTORY].find((x) => x.key === preview.module);
                    if (m) setConfirmDialogFor(m);
                  }}
                  className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-red-600 px-8 text-sm font-black uppercase tracking-[0.1em] text-white shadow-lg transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  <Trash2 className="h-4 w-4" />
                  Run {labelFor(preview.module)}
                </button>
              </div>

              {!backupSatisfied ? (
                <p className="mt-3 text-xs font-bold text-amber-700">
                  Execution is blocked until a backup exists, or both acknowledgements are ticked.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {/* ------------------------------------------------ result */}
      {result ? (
        <div className="w-full space-y-4">
          <div className="w-full rounded-[2rem] border-2 border-sky-200 bg-white p-6 shadow-[0_18px_50px_rgba(2,132,199,0.10)]">
            <h2 className="text-lg font-black text-slate-900">Backup</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Stat label="Created" value={result.backup.created ? "Yes" : "No"} />
              <Stat label="Location" value={result.backup.location || "—"} mono />
              <Stat
                label="Acknowledged without"
                value={result.backup.acknowledgedWithout ? "Yes" : "No"}
              />
            </div>
          </div>

          <div className="w-full rounded-[2rem] border-2 border-emerald-200 bg-white p-6 shadow-[0_18px_50px_rgba(16,185,129,0.10)]">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              <h2 className="text-lg font-black text-slate-900">{labelFor(result.module)} complete</h2>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="Rows deleted" value={result.totalRowsDeleted.toLocaleString()} />
              <Stat label="Tables affected" value={String(Object.keys(result.rowsDeleted).length)} />
              <Stat label="Duration" value={`${result.durationMs} ms`} />
            </div>

            {Object.keys(result.rowsDeleted).length ? (
              <div className="mt-4 max-h-64 overflow-y-auto rounded-2xl border border-slate-100">
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(result.rowsDeleted)
                      .sort((a, b) => b[1] - a[1])
                      .map(([table, count]) => (
                        <tr key={table} className="border-b border-slate-50 last:border-0">
                          <td className="px-4 py-2 font-mono text-xs text-slate-600">{table}</td>
                          <td className="px-4 py-2 text-right font-black tabular-nums text-slate-900">
                            {count.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          {/* health check */}
          <div
            className={`w-full rounded-[2rem] border-2 p-6 ${
              result.validation?.clean ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
            }`}
          >
            <h2 className="text-lg font-black text-slate-900">Post-reset validation</h2>

            <div className="mt-4 space-y-1">
              {(result.validation?.headline || []).map((h) => (
                <div key={h.table} className="flex items-baseline gap-2 font-mono text-xs">
                  <span className="text-slate-600">{h.label}</span>
                  <span className="min-w-0 flex-1 overflow-hidden text-slate-300">
                    ....................................................
                  </span>
                  <span className={`font-black tabular-nums ${h.rows === 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {h.rows.toLocaleString()}
                  </span>
                </div>
              ))}
              <div className="flex items-baseline gap-2 font-mono text-xs">
                <span className="text-slate-600">Orphan Records</span>
                <span className="min-w-0 flex-1 overflow-hidden text-slate-300">
                  ....................................................
                </span>
                <span
                  className={`font-black tabular-nums ${
                    result.validation?.orphanRecords === 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {(result.validation?.orphanRecords ?? 0).toLocaleString()}
                </span>
              </div>
            </div>

            {result.validation?.clean ? (
              <p className="mt-5 text-lg font-black text-emerald-800">
                ✔ Environment is clean. Ready for import.
              </p>
            ) : (
              <>
                <p className="mt-5 text-lg font-black text-red-800">❌ Reset incomplete.</p>
                <p className="mt-1 text-sm font-semibold text-red-700">
                  The following tables still contain data:
                </p>
                <ul className="mt-2 space-y-1">
                  {(result.validation?.remaining || []).map((r) => (
                    <li key={r.table_name} className="font-mono text-xs text-red-800">
                      {r.table_name} — {r.row_count.toLocaleString()}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ audit */}
      {audit.length ? (
        <div className="w-full rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-lg font-black text-slate-900">Reset history</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Module</th>
                  <th className="px-3 py-2">Operator</th>
                  <th className="px-3 py-2 text-right">Rows</th>
                  <th className="px-3 py-2 text-right">Duration</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-t border-slate-50">
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{labelFor(a.module)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{a.actor_email || "—"}</td>
                    <td className="px-3 py-2 text-right font-black tabular-nums">
                      {a.total_rows_deleted.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500">
                      {a.duration_ms ? `${a.duration_ms} ms` : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{a.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ confirm dialog */}
      {confirmDialogFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-red-600 p-3 text-white">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-black text-slate-900">{confirmDialogFor.label}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {preview?.total.toLocaleString()} rows across {preview?.rows.length} tables will be permanently
                  deleted for:
                </p>
                <p className="mt-2 font-black text-slate-900">{selectedCompany?.name}</p>
                <p className="font-mono text-xs text-slate-500">{selectedCompany?.id}</p>
                <p className="mt-3 text-sm font-bold text-red-700">
                  {backupLocation
                    ? `Recoverable from ${backupLocation}`
                    : "No backup exists. This cannot be undone."}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDialogFor(null)}
                disabled={busy === "execute"}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => runExecute(confirmDialogFor.key)}
                disabled={busy === "execute"}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-6 py-3 text-sm font-black uppercase tracking-[0.1em] text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy === "execute" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" /> Delete permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function labelFor(key: string) {
  return [...MODULES, FACTORY].find((m) => m.key === key)?.label || key;
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1 break-all font-black text-slate-900 ${mono ? "font-mono text-xs" : "text-2xl"}`}>{value}</p>
    </div>
  );
}

function ModuleCard({
  module,
  active,
  disabled,
  busy,
  onPreview,
  danger,
}: {
  module: ResetModule;
  active: boolean;
  disabled: boolean;
  busy: boolean;
  onPreview: () => void;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        danger
          ? "border-red-300 bg-white"
          : active
            ? "border-violet-300 bg-violet-50"
            : "border-slate-100 bg-white hover:border-violet-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-xl p-2 ${danger ? "bg-red-100 text-red-700" : "bg-violet-100 text-violet-700"}`}>
          <Database className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black text-slate-900">{module.label}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{module.summary}</p>
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onPreview}
        className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.1em] transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
          danger ? "bg-red-100 text-red-800 hover:bg-red-200" : "bg-slate-900 text-white hover:bg-slate-700"
        }`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        Preview
      </button>
    </div>
  );
}
