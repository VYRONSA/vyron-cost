"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";
import { useManufacturingPermissions } from "@/hooks/useModulePermissions";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import {
  VyronPremiumEmptyState,
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

type Run = {
  id: string;
  run_number: string;
  bom_name_snapshot: string;
  product_name_snapshot: string | null;
  status: string;
  planned_qty: number;
  actual_qty: number;
  yield_pct: number;
  total_production_cost: number;
  completed_at: string | null;
  created_at: string;
  created_by: string | null;
};

const STATUS_OPTIONS = ["", "Planned", "Approved", "In Production", "Completed", "Reversed", "Cancelled"];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ProductionRunsListClient({ title = "Manufacturing History" }: { title?: string }) {
  const { canCreate, canReverse } = useManufacturingPermissions();
  const [runs, setRuns] = useState<Run[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [supervisorMode, setSupervisorMode] = useState(false);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const { query: workspaceQuery } = poApiWorkspaceContext();
    const params = new URLSearchParams(workspaceQuery ? workspaceQuery.slice(1) : "");
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/production/runs?${params}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setRuns(d.runs);
      });
  }, [status, search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function reverseBatch(run: Run) {
    const reason = window.prompt("Supervisor reversal reason (required):", "Incorrect batch quantity captured");
    if (!reason?.trim()) return;
    setBusyId(run.id);
    setMessage("");
    const { body: workspaceBody } = poApiWorkspaceContext();
    const res = await fetch(`/api/production/runs/${run.id}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...workspaceBody, reason, actor: "supervisor", supervisor: true }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!data.ok) {
      setMessage(data.error || "Reversal failed.");
      return;
    }
    setMessage(`Batch ${run.run_number} reversed — inventory movements undone.`);
    refresh();
  }

  return (
    <section className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="products"
        badge="Premium Manufacturing Workspace"
        title={title}
        subtitle="Production batch history — yield, cost, status and supervisor reversal controls."
        outcomes={[
          "Filter batches by status and search",
          "Review yield and production cost per run",
          "Open batch detail for variances",
          "Supervisor reversal when permitted",
        ]}
        quotes={[
          { label: "Yield", quote: "What gets measured gets protected." },
          { label: "Cost", quote: "Small cost leaks become large financial problems." },
        ]}
      >
        {canCreate ? (
          <Link href="/manufacturing/runs/new" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-violet-900 shadow-lg">
            New Production Run
          </Link>
        ) : null}
      </VyronPremiumHeroBanner>

      <VyronPremiumFormulaCard
        variant="light"
        eyebrow="Production"
        title="Yield and cost formulas"
        formulas={[
          { label: "Yield %", formula: "Actual output ÷ Planned output × 100" },
          { label: "Batch Cost", formula: "Ingredient + packaging + labour + overhead" },
          { label: "Unit Cost", formula: "Batch cost ÷ actual yield quantity" },
        ]}
        className="max-w-2xl"
      />

      <VyronPremiumSectionHeading eyebrow="Filter" title="Production batches" subtitle="Search and filter manufacturing history." />

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s || "all"} value={s}>
              {s || "All statuses"}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search batch, product, recipe…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm"
        />
        {canReverse ? (
          <label className="flex items-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-xs font-black text-fuchsia-900">
            <input type="checkbox" checked={supervisorMode} onChange={(e) => setSupervisorMode(e.target.checked)} />
            Supervisor mode
          </label>
        ) : null}
      </div>

      {message ? <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">{message}</p> : null}

      <div className="overflow-x-auto rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="min-w-[1100px]">
          <div className="grid grid-cols-9 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
            <div>Batch #</div>
            <div>Date</div>
            <div className="col-span-2">Product</div>
            <div>Qty Produced</div>
            <div>Cost</div>
            <div>Status</div>
            <div>Created By</div>
            <div>Actions</div>
          </div>
          {runs.length === 0 ? (
            <div className="p-6">
              <VyronPremiumEmptyState
                steps={[
                  "Create a recipe / BOM with accurate yield and costs.",
                  "Start a new production run from Manufacturing.",
                  "Complete the batch and post stock movements.",
                  "Return here to review history and variances.",
                ]}
              />
            </div>
          ) : (
            runs.map((run) => {
              const qty = run.status === "Completed" || run.status === "Reversed" ? run.actual_qty : run.planned_qty;
              const date = run.completed_at || run.created_at;
              const canReverseRun = canReverse && supervisorMode && run.status === "Completed";
              const canAdjust = canReverse && supervisorMode && ["Planned", "Approved", "In Production", "Completed"].includes(run.status);
              return (
                <div
                  key={run.id}
                  className="grid grid-cols-9 items-center border-t border-slate-100 px-5 py-4 text-sm"
                >
                  <div className="font-black text-violet-800">{run.run_number}</div>
                  <div className="text-slate-600">{formatDate(date)}</div>
                  <div className="col-span-2">
                    <div className="font-bold text-slate-900">{run.product_name_snapshot || run.bom_name_snapshot}</div>
                    {run.product_name_snapshot ? (
                      <div className="text-xs text-slate-500">{run.bom_name_snapshot}</div>
                    ) : null}
                  </div>
                  <div className="font-bold">{qty}</div>
                  <div className="font-black">{formatMoney(run.total_production_cost)}</div>
                  <div>
                    <span
                      className={`rounded-lg px-2 py-1 text-xs font-black ${
                        run.status === "Reversed"
                          ? "bg-red-100 text-red-800"
                          : run.status === "Completed"
                            ? "bg-[#A855F7]/12 text-[#4D7C0F]"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                  <div className="text-slate-600">{run.created_by || "—"}</div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/manufacturing/runs/${run.id}`}
                      className="rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-100"
                    >
                      Open
                    </Link>
                    {canAdjust ? (
                      <Link
                        href={`/manufacturing/runs/${run.id}?adjust=1`}
                        className="rounded-lg bg-fuchsia-50 px-3 py-1.5 text-xs font-black text-fuchsia-800 hover:bg-fuchsia-100"
                      >
                        Adjust
                      </Link>
                    ) : null}
                    {canReverseRun ? (
                      <button
                        type="button"
                        disabled={busyId === run.id}
                        onClick={() => void reverseBatch(run)}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        {busyId === run.id ? "…" : "Reverse"}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-500">
        {title} — reversals restore raw materials and remove finished goods. No records are deleted; audit trail preserved on each batch.
      </p>
    </section>
  );
}
