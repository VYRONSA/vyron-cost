"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { useManufacturingPermissions } from "@/hooks/useModulePermissions";
import { formatMoney } from "@/lib/vyron-cost-data";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import { WASTE_REASONS } from "@/lib/vyron-manufacturing";
import { DocumentPdfActions } from "@/components/vyron-platform/documents/DocumentPdfActions";

type Run = {
  id: string;
  run_number: string;
  status: string;
  bom_name_snapshot: string;
  product_name_snapshot: string | null;
  planned_qty: number;
  actual_qty: number;
  yield_pct: number;
  yield_status: string | null;
  wastage_pct: number;
  planned_cost: number;
  actual_cost: number;
  cost_variance_pct: number;
  ingredient_cost: number;
  packaging_cost: number;
  labour_cost: number;
  overhead_cost: number;
  cost_per_unit: number;
  production_efficiency_pct: number;
  usage_variance_pct: number;
  lines?: Array<{
    id: string;
    line_type: string;
    line_name: string;
    unit: string;
    planned_qty: number;
    actual_qty: number;
    unit_cost: number;
    planned_value: number;
    actual_value: number;
  }>;
  labour?: Array<{ description: string; hours: number; rate: number; labour_cost: number }>;
  overhead?: Array<{ overhead_type: string; allocation_method: string; allocated_cost: number }>;
  wastage?: Array<{ waste_category: string; line_name: string; waste_qty: number; waste_value: number; waste_reason: string }>;
  audit?: Array<{ event_type: string; actor: string | null; detail: string | null; created_at: string }>;
};

type Shortage = { ingredient: string; required: number; available: number; shortfall: number; unit: string };

export default function ProductionRunDetailClient({ runId }: { runId: string }) {
  const { canCreate, canStart, canComplete } = useManufacturingPermissions();
  const [run, setRun] = useState<Run | null>(null);
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [actualQty, setActualQty] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [wasteLine, setWasteLine] = useState("");
  const [wasteQty, setWasteQty] = useState("");
  const [wasteValue, setWasteValue] = useState("");
  const [wasteReason, setWasteReason] = useState("Production Error");
  const [wasteCategory, setWasteCategory] = useState("Ingredient");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    const { query } = poApiWorkspaceContext();
    fetch(`/api/production/runs/${runId}${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setRun(d.run);
          setActualQty(String(d.run.actual_qty || d.run.planned_qty || ""));
          setMessage("");
        } else {
          setRun(null);
          setMessage(d.error || "Production run not found.");
        }
      });
    fetch(`/api/production/runs/${runId}/validate-stock${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setShortages(d.shortages || []);
      });
  }, [runId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function action(path: string, body?: Record<string, unknown>) {
    setLoading(true);
    setMessage("");
    const { body: workspaceBody } = poApiWorkspaceContext();
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...workspaceBody, ...(body || {}) }),
    });
    const data = await res.json();
    setLoading(false);
    if (!data.ok) {
      setMessage(data.error || "Action failed");
      if (data.shortages) setShortages(data.shortages);
      return;
    }
    setMessage("Updated.");
    refresh();
  }

  async function complete(withOverride = false) {
    if (!canComplete) {
      setMessage("You do not have permission to complete production runs.");
      return;
    }
    const wastage =
      wasteLine && Number(wasteQty) > 0
        ? [
            {
              waste_category: wasteCategory,
              line_name: wasteLine,
              waste_qty: Number(wasteQty),
              waste_value: Number(wasteValue) || 0,
              waste_reason: wasteReason,
            },
          ]
        : [];

    setLoading(true);
    const { body: workspaceBody } = poApiWorkspaceContext();
    const res = await fetch(`/api/production/runs/${runId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...workspaceBody,
        actual_qty: Number(actualQty),
        wastage,
        stock_override: withOverride,
        stock_override_reason: overrideReason,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!data.ok) {
      if (data.shortages) setShortages(data.shortages);
      setMessage(data.error === "Stock shortage" ? "Insufficient stock — override required to complete." : data.error);
      return;
    }
    setMessage("Production completed. Stock ledger and product costs updated.");
    refresh();
  }

  if (!run) return <p className="text-sm font-semibold text-slate-500">{message || "Loading production run…"}</p>;

  const ingredients = (run.lines || []).filter((l) => l.line_type === "Ingredient");
  const packaging = (run.lines || []).filter((l) => l.line_type === "Packaging");

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        badge: "Run Intelligence",
        title: "Production Run Control Centre",
        subtitle: "Review ingredient usage, costing, and completion controls for each manufacturing run.",
        outcomes: ["Manage run completion safely", "Resolve shortages with governance", "Audit variance and wastage with evidence"],
        formulas: ["Yield % = Actual Qty / Planned Qty", "Total Cost = Ingredient + Packaging + Labour + Overhead", "Cost Variance % = (Actual - Planned) / Planned"],
        intelligenceItems: [
          { label: "Run context", detail: run.run_number },
          { label: "Stock validation", detail: `${shortages.length} current shortage lines` },
          { label: "Action readiness", detail: `Status: ${run.status}` },
        ],
      }}
    >
      <section className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-950">{run.run_number}</h2>
          <p className="text-sm font-semibold text-slate-600">
            {run.bom_name_snapshot}
            {run.product_name_snapshot ? ` → ${run.product_name_snapshot}` : ""}
          </p>
        </div>
        <span className="rounded-2xl bg-violet-100 px-4 py-2 text-sm font-black text-violet-800">{run.status}</span>
      </div>

      {message ? <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-800">{message}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Planned Qty", run.planned_qty],
          ["Planned Cost", formatMoney(run.planned_cost)],
          ["Yield", run.status === "Completed" ? `${run.yield_pct}% (${run.yield_status})` : "—"],
          ["Cost / Unit", formatMoney(run.cost_per_unit)],
        ].map(([label, val]) => (
          <div key={String(label)} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="text-[10px] font-black uppercase text-violet-600">{label}</div>
            <div className="mt-1 text-xl font-black">{val}</div>
          </div>
        ))}
      </div>

      {shortages.length > 0 && run.status !== "Completed" ? (
        <div className="rounded-[2rem] border border-red-200 bg-red-50 p-6">
          <h3 className="text-sm font-black uppercase text-red-800">Stock Shortage</h3>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-black uppercase text-red-700">
                <th className="py-2">Ingredient</th>
                <th>Required</th>
                <th>Available</th>
                <th>Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {shortages.map((s, i) => (
                <tr key={i} className="border-t border-red-100 font-semibold">
                  <td className="py-2">{s.ingredient}</td>
                  <td>
                    {s.required} {s.unit}
                  </td>
                  <td>
                    {s.available} {s.unit}
                  </td>
                  <td className="font-black text-red-700">
                    {s.shortfall} {s.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h3 className="text-sm font-black uppercase text-[#4D7C0F]">Required Ingredients</h3>
          <ul className="mt-3 space-y-2 text-sm font-semibold">
            {ingredients.map((l) => (
              <li key={l.id} className="flex justify-between border-b border-slate-50 py-2">
                <span>{l.line_name}</span>
                <span>
                  {l.planned_qty} {l.unit} · {formatMoney(l.planned_value)}
                </span>
              </li>
            ))}
          </ul>
          <h3 className="mt-6 text-sm font-black uppercase text-[#4D7C0F]">Required Packaging</h3>
          <ul className="mt-3 space-y-2 text-sm font-semibold">
            {packaging.map((l) => (
              <li key={l.id} className="flex justify-between border-b border-slate-50 py-2">
                <span>{l.line_name}</span>
                <span>
                  {l.planned_qty} {l.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h3 className="text-sm font-black uppercase text-violet-800">Production Costing</h3>
          <dl className="mt-3 space-y-2 text-sm font-semibold">
            <div className="flex justify-between">
              <dt>Ingredient cost</dt>
              <dd>{formatMoney(run.ingredient_cost)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Packaging cost</dt>
              <dd>{formatMoney(run.packaging_cost)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Labour cost</dt>
              <dd>{formatMoney(run.labour_cost)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Overhead</dt>
              <dd>{formatMoney(run.overhead_cost)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 font-black">
              <dt>Total</dt>
              <dd>{formatMoney(run.actual_cost || run.planned_cost)}</dd>
            </div>
          </dl>
          {(run.labour || []).map((l, i) => (
            <p key={i} className="mt-2 text-xs text-slate-500">
              {l.description}: {l.hours}h × R{l.rate} = {formatMoney(l.labour_cost)}
            </p>
          ))}
        </div>
      </div>

      {run.status === "Completed" ? (
        <div className="rounded-[2rem] border border-[#A855F7]/20 bg-[#A855F7]/10 p-6">
          <h3 className="text-sm font-black uppercase text-[#4D7C0F]">Variance Analysis</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm font-bold">
            <div>Cost variance: {run.cost_variance_pct}%</div>
            <div>Usage variance: {run.usage_variance_pct}%</div>
            <div>Efficiency: {run.production_efficiency_pct}%</div>
            <div>Wastage: {run.wastage_pct}%</div>
          </div>
          {(run.wastage || []).length > 0 ? (
            <ul className="mt-4 text-sm">
              {run.wastage!.map((w, i) => (
                <li key={i}>
                  {w.line_name}: {w.waste_qty} ({w.waste_reason}) — {formatMoney(w.waste_value)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h3 className="text-sm font-black uppercase text-slate-700">Complete production</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-black uppercase">Actual quantity produced</label>
              <input
                type="number"
                value={actualQty}
                onChange={(e) => setActualQty(e.target.value)}
                className="mt-1 w-full rounded-xl border px-4 py-2"
              />
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select value={wasteCategory} onChange={(e) => setWasteCategory(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
              <option>Ingredient</option>
              <option>Packaging</option>
            </select>
            <input placeholder="Waste line" value={wasteLine} onChange={(e) => setWasteLine(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
            <input placeholder="Qty" type="number" value={wasteQty} onChange={(e) => setWasteQty(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
            <input placeholder="Value R" type="number" value={wasteValue} onChange={(e) => setWasteValue(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
            <select value={wasteReason} onChange={(e) => setWasteReason(e.target.value)} className="rounded-xl border px-3 py-2 text-sm sm:col-span-2">
              {WASTE_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          {shortages.length > 0 ? (
            <div className="mt-4">
              <label className="text-xs font-black uppercase text-red-700">Override reason (required if short)</label>
              <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="mt-1 w-full rounded-xl border px-4 py-2 text-sm" />
            </div>
          ) : null}
          {canComplete ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => void complete(shortages.length > 0)}
                className="rounded-2xl vyron-grad-surface border border-transparent px-5 py-3 text-sm font-black text-[#F8FAFC] disabled:opacity-60"
              >
                Complete & post to stock
              </button>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {run.status === "Planned" && canComplete ? (
          <button type="button" disabled={loading} onClick={() => void action(`/api/production/runs/${runId}/approve`)} className="rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white">
            Approve
          </button>
        ) : null}
        {run.status === "Approved" && canStart ? (
          <button type="button" disabled={loading} onClick={() => void action(`/api/production/runs/${runId}/start`)} className="rounded-2xl bg-fuchsia-600 px-5 py-3 text-sm font-black text-white">
            Start production
          </button>
        ) : null}
        {(run.status === "Approved" || run.status === "In Production") && canComplete ? (
          <button type="button" disabled={loading} onClick={() => void complete(false)} className="rounded-2xl vyron-grad-surface border border-transparent px-5 py-3 text-sm font-black text-white">
            Quick complete
          </button>
        ) : null}
        {run.status !== "Completed" && run.status !== "Cancelled" && canCreate ? (
          <button type="button" disabled={loading} onClick={() => void action(`/api/production/runs/${runId}/cancel`)} className="rounded-2xl border border-red-200 px-5 py-3 text-sm font-black text-red-700">
            Cancel
          </button>
        ) : null}
        <Link href="/inventory/ledger" className="rounded-2xl border px-5 py-3 text-sm font-black text-slate-700">
          Stock ledger
        </Link>
        <DocumentPdfActions
          pdfUrl={`/api/production/runs/${runId}/pdf${poApiWorkspaceContext().query}`}
          fileName={`${String(run.run_number || runId)}.pdf`}
        />
      </div>

        {(run.audit || []).length > 0 ? (
        <div className="rounded-[2rem] bg-slate-50 p-6">
          <h3 className="text-sm font-black uppercase text-slate-600">Audit trail</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {run.audit!.map((a, i) => (
              <li key={i} className="font-semibold text-slate-700">
                <span className="text-violet-700">{a.event_type}</span> — {a.actor || "system"} — {a.detail || ""}{" "}
                <span className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
        ) : null}
      </section>
    </VyronPremiumPageShell>
  );
}
