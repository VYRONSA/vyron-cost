"use client";

import { useState } from "react";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";

type Run = Record<string, unknown>;

const FIELDS = [
  "planned_date",
  "due_date",
  "priority",
  "production_area",
  "responsible_person",
  "on_hold",
  "on_hold_reason",
  "rejected_qty",
  "rework_qty",
  "downtime_minutes",
  "downtime_reason",
] as const;

const asText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * Production Control — the schedule and quality facts the Daily Production
 * Control Report reads. Saving never changes planned or actual quantities,
 * costs or stock; every change is audited on the run.
 */
export default function ProductionRunControlPanel({
  run,
  runId,
  canEdit,
  onSaved,
}: {
  run: Run;
  runId: string;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const installed = "planned_date" in run;
  const status = String(run.status || "");
  const closed = status === "Cancelled" || status === "Reversed";
  const qualityOpen = status === "In Production" || status === "Completed";
  // Initialised from the run; the parent remounts this panel (key) when the run changes.
  const [form, setForm] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f, f === "on_hold" ? run[f] === true : asText(run[f]).slice(0, f.endsWith("_date") ? 10 : undefined)]))
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!installed) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
        Production Control: the schedule and quality fields are not installed in this database yet.
      </section>
    );
  }

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const disabled = !canEdit || closed || busy;
  const input = "mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-semibold text-slate-900 disabled:bg-slate-50";

  async function save() {
    setBusy(true);
    setMessage(null);
    const control: Record<string, unknown> = {
      planned_date: form.planned_date || null,
      due_date: form.due_date || null,
      priority: form.priority || null,
      production_area: form.production_area || null,
      responsible_person: form.responsible_person || null,
    };
    if (status !== "Completed") {
      control.on_hold = Boolean(form.on_hold);
      control.on_hold_reason = form.on_hold_reason || null;
    }
    if (qualityOpen) {
      control.rejected_qty = form.rejected_qty === "" ? null : form.rejected_qty;
      control.rework_qty = form.rework_qty === "" ? null : form.rework_qty;
      control.downtime_minutes = form.downtime_minutes === "" ? null : form.downtime_minutes;
      control.downtime_reason = form.downtime_reason || null;
    }
    try {
      const { body } = poApiWorkspaceContext();
      const res = await fetch(`/api/production/runs/${runId}/control`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, control }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not save.");
      setMessage({ ok: true, text: "Production control saved. Quantities, costs and stock were not changed." });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-black text-slate-900">Production Control</h2>
        <span className="text-[11px] font-semibold text-slate-500">
          Feeds the Daily Production Control Report. Planned qty {asText(run.planned_qty)} is the issued plan and never changes here.
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-[11px] font-black uppercase text-slate-500">
          Planned production date
          <input type="date" disabled={disabled} value={String(form.planned_date ?? "")} onChange={(e) => set("planned_date", e.target.value)} className={input} />
          {run.original_planned_date && run.original_planned_date !== run.planned_date ? (
            <span className="mt-0.5 block normal-case text-amber-700">Originally {asText(run.original_planned_date)}</span>
          ) : null}
        </label>
        <label className="text-[11px] font-black uppercase text-slate-500">
          Required completion date
          <input type="date" disabled={disabled} value={String(form.due_date ?? "")} onChange={(e) => set("due_date", e.target.value)} className={input} />
        </label>
        <label className="text-[11px] font-black uppercase text-slate-500">
          Priority
          <select disabled={disabled} value={String(form.priority ?? "")} onChange={(e) => set("priority", e.target.value)} className={input}>
            <option value="">Not set</option>
            {["Low", "Normal", "High", "Urgent"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-black uppercase text-slate-500">
          Production area
          <input disabled={disabled} value={String(form.production_area ?? "")} onChange={(e) => set("production_area", e.target.value)} className={input} />
        </label>
        <label className="text-[11px] font-black uppercase text-slate-500">
          Responsible person
          <input disabled={disabled} value={String(form.responsible_person ?? "")} onChange={(e) => set("responsible_person", e.target.value)} className={input} />
        </label>
      </div>
      {status !== "Completed" ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 pb-2 text-[11px] font-black uppercase text-slate-600">
            <input type="checkbox" disabled={disabled} checked={Boolean(form.on_hold)} onChange={(e) => set("on_hold", e.target.checked)} />
            On hold
          </label>
          {form.on_hold ? (
            <label className="min-w-[280px] flex-1 text-[11px] font-black uppercase text-slate-500">
              Hold reason (required)
              <input disabled={disabled} value={String(form.on_hold_reason ?? "")} onChange={(e) => set("on_hold_reason", e.target.value)} className={input} />
            </label>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["rejected_qty", "Rejected quantity", "number"],
            ["rework_qty", "Rework quantity", "number"],
            ["downtime_minutes", "Downtime (minutes)", "number"],
            ["downtime_reason", "Downtime reason", "text"],
          ] as const
        ).map(([key, label, type]) => (
          <label key={key} className="text-[11px] font-black uppercase text-slate-500">
            {label}
            <input
              type={type}
              min={type === "number" ? 0 : undefined}
              disabled={disabled || !qualityOpen}
              value={String(form[key] ?? "")}
              onChange={(e) => set(key, e.target.value)}
              className={input}
              placeholder={qualityOpen ? "" : "After production starts"}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {canEdit && !closed ? (
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
            {busy ? "Saving…" : "Save production control"}
          </button>
        ) : (
          <span className="text-[12px] font-semibold text-slate-500">
            {closed ? `This run is ${status}.` : "You need permission to create production runs to edit these details."}
          </span>
        )}
        {message ? <span className={`text-[12px] font-bold ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</span> : null}
      </div>
    </section>
  );
}
