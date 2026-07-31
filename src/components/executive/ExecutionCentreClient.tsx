"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckSquare,
  Download,
  Gavel,
  Play,
  RefreshCcw,
  Search,
  XCircle,
} from "lucide-react";
import {
  buildExecutionQueueCsv,
  type ExecutionDashboardSummary,
  type ExecutionSourceModule,
  type ExecutionStatusTab,
  isActionOverdue,
  sourceModuleLabel,
} from "@/lib/vyron-execution-centre";
import type {
  ExecutionActionEvent,
  ExecutionActionRow,
  ExecutionPersistenceInfo,
} from "@/lib/vyron-execution-actions-data";
import type { TenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";

const M = VYRON_MASTER;

const OWNERS = ["Executive", "Finance", "Procurement", "Operations", "Inventory", "Manufacturing"] as const;
const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
const SOURCES: ExecutionSourceModule[] = ["actions-centre", "decisions-centre", "root-cause-centre"];

const STATUS_TABS: ExecutionStatusTab[] = [
  "All",
  "Recommended",
  "Approved",
  "In Progress",
  "Completed",
  "Cancelled",
  "Overdue",
];

function currentPeriodLabel() {
  return new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function money(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function formatEventTime(value: string) {
  return new Date(value).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ExecutionCentreClient({
  intelligence,
  companyName,
  hasWorkspace,
}: {
  intelligence: TenantCostIntelligence | null;
  companyName: string;
  hasWorkspace: boolean;
}) {
  const [actions, setActions] = useState<ExecutionActionRow[]>([]);
  const [summary, setSummary] = useState<ExecutionDashboardSummary>({
    recommended: 0,
    approved: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
  });
  const [persistence, setPersistence] = useState<ExecutionPersistenceInfo | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [priorityFilter, setPriorityFilter] = useState<string>("All");
  const [ownerFilter, setOwnerFilter] = useState<string>("All");
  const [sourceFilter, setSourceFilter] = useState<string>("All");
  const [activeTab, setActiveTab] = useState<ExecutionStatusTab>("All");
  const [saving, setSaving] = useState(false);

  const selected = actions.find((row) => row.id === selectedId) || null;
  const readOnly = !canWrite || persistence?.mode === "unavailable";

  const loadActions = useCallback(() => {
    if (!hasWorkspace) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    fetch("/api/execution-centre/actions")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "Load failed");
        setActions(data.actions || []);
        setSummary(
          data.summary || { recommended: 0, approved: 0, inProgress: 0, completed: 0, overdue: 0 }
        );
        setPersistence(data.persistence || null);
        setCanWrite(Boolean(data.canWrite));
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [hasWorkspace]);

  const syncFromIntelligence = useCallback(() => {
    if (!hasWorkspace || !intelligence || readOnly) return;
    setSyncing(true);
    setLoadError(null);

    fetch("/api/execution-centre/actions", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "Sync failed");
        setActions(data.actions || []);
        setSummary(data.summary || summary);
        setPersistence(data.persistence || null);
        setCanWrite(Boolean(data.canWrite));
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Sync failed"))
      .finally(() => setSyncing(false));
  }, [hasWorkspace, intelligence, readOnly, summary]);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const filteredActions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return actions.filter((row) => {
      if (activeTab === "Overdue" && !isActionOverdue(row)) return false;
      if (activeTab !== "All" && activeTab !== "Overdue" && row.status !== activeTab) return false;
      if (statusFilter !== "All" && row.status !== statusFilter) return false;
      if (priorityFilter !== "All" && row.priority !== priorityFilter) return false;
      if (ownerFilter !== "All" && row.owner !== ownerFilter) return false;
      if (sourceFilter !== "All" && row.source_module !== sourceFilter) return false;
      if (!query) return true;
      const haystack = [
        row.title,
        row.owner,
        row.category,
        row.expected_outcome,
        sourceModuleLabel(row.source_module),
        row.notes || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [actions, searchQuery, statusFilter, priorityFilter, ownerFilter, sourceFilter, activeTab]);

  const patchAction = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      if (readOnly) return;
      setSaving(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/execution-centre/actions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Update failed");
        if (data.action) {
          setActions((prev) => prev.map((row) => (row.id === id ? data.action : row)));
        }
        if (data.summary) setSummary(data.summary);
        if (data.persistence) setPersistence(data.persistence);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Update failed");
      } finally {
        setSaving(false);
      }
    },
    [readOnly]
  );

  const exportCsv = useCallback(() => {
    const csv = buildExecutionQueueCsv(filteredActions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vyron-execution-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [filteredActions]);

  const selectTab = (tab: ExecutionStatusTab) => {
    setActiveTab(tab);
    if (tab === "All" || tab === "Overdue") {
      setStatusFilter("All");
    } else {
      setStatusFilter(tab);
    }
  };

  return (
    <div className="space-y-6">
      <header className={M.moduleHeaderNavy}>
        <div className={`relative p-1 md:p-2 ${M.dashboardHeroInner}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#3B82F6]/35 bg-[#3B82F6]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#FECDD3]">
                Execution Centre
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Execution Centre</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                Execute approved intelligence actions for{" "}
                <span className="font-bold text-white">{companyName}</span> · {currentPeriodLabel()}
              </p>
              <p className={`mt-2 text-xs font-semibold text-[#CBD5E1]`}>
                Human approval required — no full automation. Actions originate from Actions, Decisions and Root Cause
                centres only.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={syncFromIntelligence}
                disabled={syncing || !hasWorkspace || readOnly}
                className={`${M.primaryBtn} px-4 py-2 text-sm disabled:opacity-60`}
              >
                <RefreshCcw size={16} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Syncing…" : "Sync from Intelligence"}
              </button>
              <button type="button" onClick={loadActions} className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
                <RefreshCcw size={16} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      {persistence?.warning ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            persistence.mode === "unavailable"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900"
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p>{persistence.warning}</p>
              {persistence.mode === "unavailable" ? (
                <p className="mt-1 text-xs font-medium opacity-90">
                  Actions shown below may not be saved. Apply database migrations before production use.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {loadError}
        </div>
      ) : null}

      {!hasWorkspace ? (
        <section className={M.moduleDataSection}>
          <h2 className="text-xl font-bold text-[#0F172A]">Select an active workspace</h2>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Execution actions are scoped to the active company workspace.
          </p>
        </section>
      ) : (
        <>
          {!canWrite && hasWorkspace ? (
            <section className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm font-semibold text-[#475569]">
              You can view execution actions, but you do not have permission to update them.
            </section>
          ) : null}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Recommended" value={String(summary.recommended)} accent="#1D6BFF" />
            <SummaryCard label="Approved" value={String(summary.approved)} accent="#6366F1" />
            <SummaryCard label="In Progress" value={String(summary.inProgress)} accent="#C026D3" />
            <SummaryCard label="Completed" value={String(summary.completed)} accent="#8B5CF6" />
            <SummaryCard label="Overdue" value={String(summary.overdue)} accent="#2563EB" />
          </section>

          <section className={M.moduleDataSection}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#0F172A]">Execution Queue</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  {filteredActions.length} of {actions.length} action(s) shown
                </p>
              </div>
              <button
                type="button"
                onClick={exportCsv}
                disabled={filteredActions.length === 0}
                className={`${M.secondaryBtn} px-4 py-2 text-sm disabled:opacity-60`}
              >
                <Download size={16} />
                Export CSV
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => selectTab(tab)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                    activeTab === tab
                      ? "border-[#1D6BFF] bg-[#1D6BFF]/10 text-[#1D6BFF]"
                      : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#1D6BFF]/30"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="block text-xs font-bold uppercase tracking-wide text-[#64748B]">
                Search
                <div className="relative mt-1">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Action, owner, source…"
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white py-2 pl-9 pr-3 text-sm font-medium"
                  />
                </div>
              </label>
              <FilterSelect
                label="Status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={["All", "Recommended", "Approved", "In Progress", "Completed", "Cancelled"]}
              />
              <FilterSelect
                label="Priority"
                value={priorityFilter}
                onChange={setPriorityFilter}
                options={["All", ...PRIORITIES]}
              />
              <FilterSelect
                label="Owner"
                value={ownerFilter}
                onChange={setOwnerFilter}
                options={["All", ...OWNERS]}
              />
              <FilterSelect
                label="Source"
                value={sourceFilter}
                onChange={setSourceFilter}
                options={["All", ...SOURCES.map((s) => sourceModuleLabel(s))]}
                mapValue={(label) => {
                  if (label === "All") return "All";
                  const match = SOURCES.find((s) => sourceModuleLabel(s) === label);
                  return match || "All";
                }}
                displayValue={
                  sourceFilter === "All" ? "All" : sourceModuleLabel(sourceFilter as ExecutionSourceModule)
                }
              />
            </div>

            {actions.length === 0 && !loading ? (
              <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-6">
                <h3 className="font-bold text-[#0F172A]">No execution actions yet</h3>
                <p className="mt-2 text-sm font-medium text-[#64748B]">
                  Sync from intelligence to import recommended actions from Actions Centre, Decisions Centre and Root
                  Cause Centre.
                </p>
                <button
                  type="button"
                  onClick={syncFromIntelligence}
                  disabled={syncing || readOnly}
                  className={`mt-4 ${M.primaryBtn} px-4 py-2 text-sm disabled:opacity-60`}
                >
                  Sync from Intelligence
                </button>
              </div>
            ) : (
              <div className={`mt-4 ${M.tableSurface}`}>
                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] w-full text-sm">
                    <thead>
                      <tr className={VYRON_TABLE.head}>
                        <th className="px-4 py-3 text-left">Priority</th>
                        <th className="px-4 py-3 text-left">Action</th>
                        <th className="px-4 py-3 text-left">Owner</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Due Date</th>
                        <th className="px-4 py-3 text-left">Source</th>
                        <th className="px-4 py-3 text-left">Outcome</th>
                        <th className="px-4 py-3 text-right">Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={8} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                            Loading execution queue…
                          </td>
                        </tr>
                      ) : filteredActions.length === 0 ? (
                        <tr>
                          <td colSpan={8} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                            No actions match the current filters.
                          </td>
                        </tr>
                      ) : (
                        filteredActions.map((row) => (
                          <QueueRow
                            key={row.id}
                            row={row}
                            selected={selectedId === row.id}
                            onSelect={() => setSelectedId(row.id)}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {selected ? (
            <section className={M.moduleDataSection}>
              <h2 className="text-xl font-bold text-[#0F172A]">Action execution</h2>
              <p className="mt-1 text-sm font-medium text-[#64748B]">{selected.title}</p>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                  <h3 className="font-bold text-[#0F172A]">Expected outcome</h3>
                  <p className="mt-2 text-sm font-medium text-[#334155]">{selected.expected_outcome}</p>
                  <p className="mt-3 text-sm font-medium text-[#64748B]">
                    Expected benefit: {money(selected.expected_benefit)}
                  </p>
                  {selected.source_trace.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-xs font-medium text-[#64748B]">
                      {selected.source_trace.map((line) => (
                        <li key={line}>· {line}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {selected.status === "Recommended" ? (
                      <>
                        <button
                          type="button"
                          disabled={saving || readOnly}
                          onClick={() => patchAction(selected.id, { status: "Approved" })}
                          className={`${M.primaryBtn} px-3 py-2 text-xs disabled:opacity-60`}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={saving || readOnly}
                          onClick={() => patchAction(selected.id, { status: "Cancelled" })}
                          className={`${M.secondaryBtn} px-3 py-2 text-xs disabled:opacity-60`}
                        >
                          <XCircle size={14} />
                          Reject
                        </button>
                      </>
                    ) : null}
                    {selected.status === "Approved" ? (
                      <button
                        type="button"
                        disabled={saving || readOnly}
                        onClick={() => patchAction(selected.id, { status: "In Progress" })}
                        className={`${M.primaryBtn} px-3 py-2 text-xs disabled:opacity-60`}
                      >
                        <Play size={14} />
                        Start
                      </button>
                    ) : null}
                    {selected.status === "In Progress" ? (
                      <button
                        type="button"
                        disabled={saving || readOnly}
                        onClick={() =>
                          patchAction(selected.id, {
                            status: "Completed",
                            completion_notes: selected.completion_notes || "Marked complete by user.",
                          })
                        }
                        className={`${M.primaryBtn} px-3 py-2 text-xs disabled:opacity-60`}
                      >
                        <CheckSquare size={14} />
                        Mark Complete
                      </button>
                    ) : null}
                    {selected.href ? (
                      <Link href={selected.href} className={`${M.secondaryBtn} px-3 py-2 text-xs`}>
                        Open module <ArrowRight size={14} />
                      </Link>
                    ) : null}
                  </div>

                  <label className="block text-sm font-bold text-[#0F172A]">
                    Assign owner
                    <select
                      value={selected.owner}
                      disabled={saving || readOnly || selected.status === "Completed" || selected.status === "Cancelled"}
                      onChange={(event) => patchAction(selected.id, { owner: event.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium"
                    >
                      {OWNERS.map((owner) => (
                        <option key={owner} value={owner}>
                          {owner}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm font-bold text-[#0F172A]">
                    Due date
                    <input
                      type="date"
                      value={selected.due_date || ""}
                      disabled={saving || readOnly || selected.status === "Completed" || selected.status === "Cancelled"}
                      onChange={(event) => patchAction(selected.id, { due_date: event.target.value || null })}
                      className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium"
                    />
                  </label>

                  <label className="block text-sm font-bold text-[#0F172A]">
                    Notes
                    <textarea
                      key={`${selected.id}-notes-${selected.updated_at}`}
                      defaultValue={selected.notes || ""}
                      disabled={saving || readOnly}
                      rows={2}
                      onBlur={(event) => {
                        if (event.target.value !== (selected.notes || "")) {
                          patchAction(selected.id, { notes: event.target.value });
                        }
                      }}
                      className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium"
                      placeholder="Add execution notes…"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-5">
                <h3 className="font-bold text-[#0F172A]">Outcome tracking</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">
                      Expected benefit
                    </div>
                    <p className="mt-1 text-sm font-bold text-[#0F172A]">{money(selected.expected_benefit)}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">
                      Actual benefit
                      <input
                        key={`${selected.id}-benefit-${selected.updated_at}`}
                        type="number"
                        defaultValue={selected.actual_benefit ?? ""}
                        disabled={saving || readOnly}
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          const next = value === "" ? null : Number(value);
                          if (next !== selected.actual_benefit) {
                            patchAction(selected.id, { actual_benefit: next });
                          }
                        }}
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium"
                        placeholder="Enter realised benefit"
                      />
                    </label>
                  </div>
                </div>
                <label className="mt-4 block text-sm font-bold text-[#0F172A]">
                  Completion notes
                  <textarea
                    key={`${selected.id}-completion-${selected.updated_at}`}
                    defaultValue={selected.completion_notes || ""}
                    disabled={saving || readOnly}
                    rows={3}
                    onBlur={(event) => {
                      if (event.target.value !== (selected.completion_notes || "")) {
                        patchAction(selected.id, { completion_notes: event.target.value });
                      }
                    }}
                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium"
                    placeholder="Document execution outcome…"
                  />
                </label>
              </div>

              <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                <h3 className="font-bold text-[#0F172A]">Action audit trail</h3>
                {selected.action_events.length === 0 ? (
                  <p className="mt-2 text-sm font-medium text-[#64748B]">No activity recorded yet.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {[...selected.action_events].reverse().map((event) => (
                      <AuditEventItem key={event.id} event={event} />
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}

          <section className={M.moduleDataSection}>
            <h2 className="text-lg font-bold text-[#0F172A]">Drilldowns</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { label: "Actions Centre", href: "/actions", icon: CheckSquare },
                { label: "Decisions Centre", href: "/decisions", icon: Gavel },
                { label: "Root Cause Centre", href: "/root-cause", icon: Search },
                { label: "Autonomous Command", href: "/autonomous-command-centre", icon: Brain },
                { label: "Ask VYRON", href: "/ask-vyron", icon: Brain },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F6F7FB] px-4 py-2 text-sm font-semibold text-[#334155] transition hover:border-[#1D6BFF]/30 hover:text-[#1D6BFF]"
                >
                  <link.icon size={16} />
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className={`${M.moduleDataSection} p-5`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">{label}</div>
      <div className="mt-2 text-2xl font-black" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  displayValue,
  mapValue,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  displayValue?: string;
  mapValue?: (label: string) => string;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-[#64748B]">
      {label}
      <select
        value={displayValue || value}
        onChange={(event) => onChange(mapValue ? mapValue(event.target.value) : event.target.value)}
        className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function QueueRow({
  row,
  selected,
  onSelect,
}: {
  row: ExecutionActionRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const overdue = isActionOverdue(row);
  return (
    <tr
      className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover} cursor-pointer ${
        selected ? "bg-[#1D6BFF]/5" : overdue ? "bg-rose-50/80" : ""
      } ${overdue ? "border-l-4 border-l-rose-500" : ""}`}
      onClick={onSelect}
    >
      <td className="px-4 py-3">
        <PriorityBadge priority={row.priority} />
      </td>
      <td className="px-4 py-3 font-bold text-[#0F172A]">{row.title}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.owner}</td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} overdue={overdue} />
      </td>
      <td className={`px-4 py-3 text-sm font-medium ${overdue ? "font-bold text-rose-700" : "text-[#64748B]"}`}>
        {row.due_date || "—"}
      </td>
      <td className="px-4 py-3 text-sm font-semibold text-[#1D6BFF]">{sourceModuleLabel(row.source_module)}</td>
      <td className="px-4 py-3 text-sm font-medium text-[#334155]">{row.expected_outcome}</td>
      <td className="px-4 py-3 text-right text-xs font-bold text-[#1D6BFF]">Manage</td>
    </tr>
  );
}

function AuditEventItem({ event }: { event: ExecutionActionEvent }) {
  return (
    <li className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-[#0F172A]">{event.label}</span>
        <span className="text-xs font-medium text-[#94A3B8]">{formatEventTime(event.at)}</span>
      </div>
      {event.detail ? <p className="mt-1 text-xs font-medium text-[#64748B]">{event.detail}</p> : null}
    </li>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const classes =
    priority === "Critical"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : priority === "High"
        ? "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]"
        : priority === "Medium"
          ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900"
          : "border-[#1D6BFF]/25 bg-[#1D6BFF]/10 text-[#1D6BFF]";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${classes}`}>
      {priority}
    </span>
  );
}

function StatusBadge({ status, overdue }: { status: ExecutionActionRow["status"]; overdue: boolean }) {
  const classes: Record<ExecutionActionRow["status"], string> = {
    Recommended: "border-[#1D6BFF]/25 bg-[#1D6BFF]/10 text-[#1D6BFF]",
    Approved: "border-indigo-200 bg-indigo-50 text-indigo-800",
    "In Progress": "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900",
    Completed: "border-violet-200 bg-violet-50 text-violet-800",
    Cancelled: "border-[#E2E8F0] bg-[#F6F7FB] text-[#64748B]",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${
        overdue ? "border-rose-300 bg-rose-100 text-rose-800" : classes[status]
      }`}
    >
      {overdue ? "Overdue" : status}
    </span>
  );
}
