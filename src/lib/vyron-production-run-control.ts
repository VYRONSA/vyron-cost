import type { SupabaseClient } from "@supabase/supabase-js";
import { writeProductionAudit } from "@/lib/vyron-manufacturing";

/**
 * Production control capture on an MFG production run: schedule, priority,
 * area, responsible person, hold, quality (rejected / rework) and downtime.
 *
 * Never touches planned_qty, actual_qty, costs, lines or stock. The first
 * planned date a run receives is kept as original_planned_date, so
 * re-scheduling never overwrites the original issued schedule. Every changed
 * field is written to the run's audit log.
 */

export const PRODUCTION_PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;

export class ProductionControlError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProductionControlError";
    this.status = status;
  }
}

type Input = Partial<{
  planned_date: string | null;
  due_date: string | null;
  priority: string | null;
  production_area: string | null;
  responsible_person: string | null;
  on_hold: boolean;
  on_hold_reason: string | null;
  rejected_qty: number | string | null;
  rework_qty: number | string | null;
  downtime_minutes: number | string | null;
  downtime_reason: string | null;
}>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown, max = 120) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};
const qty = (v: unknown, field: string) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new ProductionControlError(`${field} must be zero or more.`);
  return n;
};
const date = (v: unknown, field: string) => {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  if (!DATE.test(s)) throw new ProductionControlError(`${field} must be a date (YYYY-MM-DD).`);
  return s;
};

export async function updateProductionRunControl(
  supabase: SupabaseClient,
  companyId: string,
  runId: string,
  input: Input,
  actor: string
) {
  const { data: run, error } = await supabase
    .from("vyron_cost_production_runs")
    .select("*")
    .eq("id", runId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!run) throw new ProductionControlError("Production run not found.", 404);
  if (!("planned_date" in run)) {
    throw new ProductionControlError("Production control fields are not installed in this database yet.", 503);
  }
  if (["Cancelled", "Reversed"].includes(String(run.status))) {
    throw new ProductionControlError(`This run is ${run.status}; its production control details can no longer change.`, 409);
  }

  const patch: Record<string, unknown> = {};
  if ("planned_date" in input) patch.planned_date = date(input.planned_date, "Planned date");
  if ("due_date" in input) patch.due_date = date(input.due_date, "Required completion date");
  if ("priority" in input) {
    const p = text(input.priority, 10);
    if (p && !(PRODUCTION_PRIORITIES as readonly string[]).includes(p)) throw new ProductionControlError("Priority must be Low, Normal, High or Urgent.");
    patch.priority = p;
  }
  if ("production_area" in input) patch.production_area = text(input.production_area);
  if ("responsible_person" in input) patch.responsible_person = text(input.responsible_person);
  if ("on_hold" in input) {
    patch.on_hold = Boolean(input.on_hold);
    if (patch.on_hold) {
      if (run.status === "Completed") throw new ProductionControlError("A completed run cannot be placed on hold.", 409);
      const reason = text(input.on_hold_reason, 500);
      if (!reason) throw new ProductionControlError("Give a reason for placing the run on hold.");
      patch.on_hold_reason = reason;
    } else {
      patch.on_hold_reason = null;
    }
  }
  const qualityTouched = ["rejected_qty", "rework_qty", "downtime_minutes", "downtime_reason"].some((k) => k in input);
  if (qualityTouched && !["In Production", "Completed"].includes(String(run.status))) {
    throw new ProductionControlError("Rejects, rework and downtime are recorded once the run is in production or completed.", 409);
  }
  if ("rejected_qty" in input) patch.rejected_qty = qty(input.rejected_qty, "Rejected quantity");
  if ("rework_qty" in input) patch.rework_qty = qty(input.rework_qty, "Rework quantity");
  if ("downtime_minutes" in input) patch.downtime_minutes = qty(input.downtime_minutes, "Downtime minutes");
  if ("downtime_reason" in input) patch.downtime_reason = text(input.downtime_reason, 500);

  if (patch.planned_date && !run.original_planned_date) patch.original_planned_date = patch.planned_date;

  const changed = Object.entries(patch).filter(([k, v]) => String(run[k] ?? "") !== String(v ?? ""));
  if (!changed.length) return run;

  const { data: updated, error: updateError } = await supabase
    .from("vyron_cost_production_runs")
    .update({ ...Object.fromEntries(changed), updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);

  for (const [field, value] of changed) {
    await writeProductionAudit(supabase, {
      companyId,
      productionRunId: runId,
      eventType: "Production Control Updated",
      actor,
      fieldName: field,
      oldValue: run[field] === null || run[field] === undefined ? "" : String(run[field]),
      newValue: value === null || value === undefined ? "" : String(value),
      detail: `${field} changed on ${run.run_number}. Planned and actual quantities, costs and stock unchanged.`,
    });
  }
  return updated;
}
