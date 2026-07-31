"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import DocumentHubdocClient from "@/components/DocumentHubdocClient";
import type { DocumentApprovalRules } from "@/lib/vyron-document-approval-rules";
import { priceMovementClass, priceMovementLabel, type PriceMovement } from "@/lib/vyron-price-history";

type Stats = {
  inboxCount: number;
  needsReviewCount: number;
  approvedTodayCount: number;
  archiveCount: number;
  deletedCount: number;
  mappingCount: number;
  priceHistoryCount: number;
  costAuditCount: number;
  openRiskCount: number;
  approvedValue: number;
  uploadedToday: number;
  awaitingReview: number;
  failedExtractions: number;
  supplierPriceIncreases: number;
  potentialRecoveryIdentified: number;
};

type WorkflowTab = "inbox" | "needs-review" | "approved-today" | "archive" | "deleted";
type UtilityTab = "learning" | "price-history" | "rules";

export default function DocumentIntelligenceDashboard() {
  const [workflowTab, setWorkflowTab] = useState<WorkflowTab>("inbox");
  const [utilityTab, setUtilityTab] = useState<UtilityTab | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [learning, setLearning] = useState<{
    suppliers: Array<Record<string, unknown>>;
    topMappings: Array<Record<string, unknown>>;
  } | null>(null);
  const [priceHistory, setPriceHistory] = useState<Array<Record<string, unknown>>>([]);
  const [rules, setRules] = useState<DocumentApprovalRules | null>(null);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [highlightDocumentId, setHighlightDocumentId] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    const response = await fetch("/api/documents/stats");
    const data = await response.json();
    if (response.ok && data.ok) setStats(data.stats as Stats);
  }, []);

  useEffect(() => {
    void refreshStats();
    try {
      const raw = sessionStorage.getItem("vyron-doc-approved");
      if (!raw) return;
      sessionStorage.removeItem("vyron-doc-approved");
      const payload = JSON.parse(raw) as { highlightDocumentId?: string; openNeedsReview?: boolean };
      if (payload.highlightDocumentId) setHighlightDocumentId(payload.highlightDocumentId);
      if (payload.openNeedsReview) setWorkflowTab("needs-review");
    } catch {
      /* ignore */
    }
  }, [refreshStats]);

  useEffect(() => {
    if (utilityTab === "learning") {
      fetch("/api/documents/learning")
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) setLearning({ suppliers: data.suppliers || [], topMappings: data.topMappings || [] });
        })
        .catch(() => setMessage("Could not load supplier learning."));
    }
    if (utilityTab === "price-history") {
      fetch("/api/documents/price-history?scope=supplier&limit=40")
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) setPriceHistory(data.rows || []);
        })
        .catch(() => setMessage("Could not load price history."));
    }
    if (utilityTab === "rules") {
      fetch("/api/documents/approval-rules")
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) setRules(data.rules as DocumentApprovalRules);
        })
        .catch(() => setMessage("Could not load approval rules."));
    }
  }, [utilityTab]);

  async function saveRules() {
    if (!rules) return;
    setRulesSaving(true);
    try {
      const response = await fetch("/api/documents/approval-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Save failed.");
      setMessage("Approval rules saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save rules.");
    } finally {
      setRulesSaving(false);
    }
  }

  const workflowTabs: Array<{ id: WorkflowTab; label: string }> = [
    { id: "inbox", label: `Inbox (${stats?.inboxCount ?? "…"})` },
    { id: "needs-review", label: `Needs Review (${stats?.needsReviewCount ?? "…"})` },
    { id: "approved-today", label: `Approved Today (${stats?.approvedTodayCount ?? "…"})` },
    { id: "archive", label: `Invoice Archive (${stats?.archiveCount ?? "…"})` },
    { id: "deleted", label: `Deleted (${stats?.deletedCount ?? "…"})` },
  ];

  const showWorkflow = !utilityTab;

  return (
    <div className="grid gap-6">
      <section className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">Document Intelligence</div>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Uploaded → Extracting → Captured → Needs Review → Approved → Archived
        </p>
        {message ? <div className="mt-3 rounded-xl bg-[var(--vyron-warning-bg)] px-4 py-2 text-xs font-bold text-[var(--vyron-warning-fg)]">{message}</div> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {[
            ["Uploaded today", stats?.uploadedToday ?? "—", "New in queue"],
            ["Awaiting review", stats?.awaitingReview ?? "—", "Needs action"],
            ["Approved today", stats?.approvedTodayCount ?? "—", "Processed today"],
            ["Archived", stats?.archiveCount ?? "—", "All approved"],
            ["Failed extractions", stats?.failedExtractions ?? "—", "Error state"],
            ["Price increases", stats?.supplierPriceIncreases ?? "—", "Today ↑"],
            ["Recovery identified", stats?.potentialRecoveryIdentified ?? "—", "Open opportunities"],
            ["Open risks", stats?.openRiskCount ?? "—", "Procurement alerts"],
          ].map(([label, value, note]) => (
            <div key={label} className="rounded-2xl bg-violet-50 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-600">{label}</div>
              <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
              <div className="mt-1 text-[11px] font-semibold text-slate-500">{note}</div>
            </div>
          ))}
        </div>
        {stats && stats.openRiskCount > 0 ? (
          <div className="mt-3">
            <Link href="/invoice-forensics" className="text-xs font-black text-rose-700 hover:underline">
              View {stats.openRiskCount} open procurement risk alert(s) →
            </Link>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {workflowTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setUtilityTab(null);
                setWorkflowTab(item.id);
              }}
              className={`rounded-full px-4 py-2 text-xs font-black ${
                showWorkflow && workflowTab === item.id ? "vyron-grad-surface text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
          {(
            [
              { id: "learning" as const, label: "Supplier Learning" },
              { id: "price-history" as const, label: "Price History" },
              { id: "rules" as const, label: "Approval Rules" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setUtilityTab(item.id)}
              className={`rounded-full px-4 py-2 text-xs font-black ${
                utilityTab === item.id ? "bg-[var(--vyron-warning-solid)] text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/document-intelligence/supplier-learning" className="text-xs font-black text-violet-700 hover:underline">
            Supplier Learning →
          </Link>
          <Link href="/document-intelligence/price-history/supplier" className="text-xs font-black text-violet-700 hover:underline">
            Price History screens →
          </Link>
          <Link href="/document-intelligence/settings" className="text-xs font-black text-violet-700 hover:underline">
            Supervisor settings →
          </Link>
        </div>
      </section>

      {showWorkflow ? (
        <DocumentHubdocClient
          mode="documents"
          listView={workflowTab}
          hideHero={workflowTab !== "inbox"}
          onListChanged={refreshStats}
          highlightDocumentId={highlightDocumentId}
        />
      ) : null}

      {utilityTab === "learning" ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="lg:col-span-2 flex justify-end">
            <Link
              href="/document-intelligence/supplier-learning"
              className="rounded-xl vyron-grad-surface px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:vyron-grad-surface"
            >
              Open Supplier Learning page
            </Link>
          </div>
          <div className="rounded-[2rem] border border-violet-100 bg-white p-6">
            <h3 className="text-lg font-black text-slate-950">Supplier invoice learning</h3>
            <div className="mt-4 space-y-2">
              {(learning?.suppliers || []).map((row) => (
                <div key={String(row.supplier_name)} className="rounded-xl border border-slate-100 p-3 text-sm">
                  <div className="font-black text-slate-900">{String(row.supplier_name)}</div>
                  <div className="text-xs text-slate-500">
                    Confidence {Number(row.confidence_score || 0)}% · Last used{" "}
                    {String(row.last_used_at || "").slice(0, 10) || "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[2rem] border border-violet-100 bg-white p-6">
            <h3 className="text-lg font-black text-slate-950">Top line mappings</h3>
            <div className="mt-4 max-h-[480px] space-y-2 overflow-y-auto">
              {(learning?.topMappings || []).map((row, index) => (
                <div key={`${row.source_description}-${index}`} className="rounded-xl border border-slate-100 p-3 text-xs">
                  <div className="font-black text-violet-800">{String(row.entity_name)}</div>
                  <div className="text-slate-600">{String(row.source_description)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {utilityTab === "price-history" ? (
        <section className="rounded-[2rem] border border-violet-100 bg-white p-6 overflow-x-auto">
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              ["Supplier", "/document-intelligence/price-history/supplier"],
              ["Ingredient", "/document-intelligence/price-history/ingredient"],
              ["Packaging", "/document-intelligence/price-history/packaging"],
              ["Product", "/document-intelligence/price-history/product"],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="rounded-full bg-violet-100 px-4 py-2 text-xs font-black text-violet-800">
                {label} Price History
              </Link>
            ))}
          </div>
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="text-[10px] font-black uppercase text-slate-500">
              <tr>
                <th className="py-2">Date</th>
                <th className="py-2">Supplier</th>
                <th className="py-2">Invoice</th>
                <th className="py-2">Item</th>
                <th className="py-2">Previous</th>
                <th className="py-2">Current</th>
                <th className="py-2">%</th>
                <th className="py-2">Movement</th>
              </tr>
            </thead>
            <tbody>
              {priceHistory.map((row) => {
                const movement = (row.price_movement as PriceMovement) || "no_change";
                return (
                  <tr key={String(row.id)} className="border-t border-slate-100">
                    <td className="py-2">{String(row.approved_at || row.created_at || "").slice(0, 10)}</td>
                    <td className="py-2">{String(row.supplier_name || "—")}</td>
                    <td className="py-2">{String(row.invoice_number || "—")}</td>
                    <td className="py-2 font-bold">{String(row.entity_name || "—")}</td>
                    <td className="py-2">R{Number(row.previous_price || 0).toFixed(2)}</td>
                    <td className="py-2">R{Number(row.new_price || 0).toFixed(2)}</td>
                    <td className="py-2">{Number(row.percentage_change || 0).toFixed(1)}%</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${priceMovementClass(movement)}`}>
                        {priceMovementLabel(movement)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {utilityTab === "rules" && rules ? (
        <section className="rounded-[2rem] border border-violet-100 bg-white p-6 max-w-xl">
          <div className="mb-4 flex justify-end">
            <Link
              href="/document-intelligence/settings"
              className="rounded-xl vyron-grad-surface px-4 py-2 text-xs font-semibold text-white"
            >
              Open full supervisor settings
            </Link>
          </div>
          <h3 className="text-lg font-black text-slate-950">Approval rules (quick)</h3>
          <div className="mt-4 grid gap-3">
            {(
              [
                ["minHeaderConfidence", "Min header confidence %", 1],
                ["roundingTolerance", "Rounding tolerance (R)", 0.01],
                ["majorMismatchThreshold", "Major mismatch threshold (R)", 0.01],
                ["maxManualOverridesBeforeAlert", "Max manual overrides before alert", 1],
                ["requireReconciliationNoteAbove", "Require reconciliation note above (R)", 0.01],
              ] as const
            ).map(([key, label, step]) => (
              <label key={key} className="grid gap-1 text-xs font-black uppercase text-slate-500">
                {label}
                <input
                  type="number"
                  step={step}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
                  value={rules[key]}
                  onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={rules.blockUnmappedLines}
                onChange={(e) => setRules({ ...rules, blockUnmappedLines: e.target.checked })}
              />
              Block approval when active lines are unmapped
            </label>
          </div>
          <button
            type="button"
            disabled={rulesSaving}
            onClick={() => void saveRules()}
            className="mt-5 rounded-xl bg-violet-700 px-5 py-2 text-xs font-black text-[#F8FAFC] disabled:opacity-60"
          >
            {rulesSaving ? "Saving…" : "Save approval rules"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
