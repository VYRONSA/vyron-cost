import type { SupabaseClient } from "@supabase/supabase-js";
import { listMinimumLevels, minimumStatus, type MinimumStatus } from "@/lib/vyron-stock-minimums";

/**
 * VOLORA — what a production run will do to stock, checked against the company's minimum levels.
 *
 *   expected = current stock − ingredient / packaging consumption (+ finished-goods output)
 *
 * Read-only: it never creates or changes a stock item. A run line whose stock item cannot be
 * found is reported as not tracked rather than guessed. Only items the company has given a
 * minimum are judged; an item with no minimum is never reported as below one.
 */

export type ProductionMinimumImpact = {
  stockItemId: string;
  itemCode: string | null;
  description: string | null;
  role: "consumed" | "produced";
  currentQty: number;
  change: number;
  expectedQty: number;
  minimumQty: number;
  warningQty: number | null;
  criticalQty: number | null;
  status: MinimumStatus;
  shortfall: number;
  blocksProduction: boolean;
};

export type ProductionMinimumCheck = {
  found: boolean;
  impacts: ProductionMinimumImpact[];
  /** Items that end at or below a warning, the minimum or the critical level. */
  warnings: ProductionMinimumImpact[];
  /** Items below the minimum whose threshold is configured to block production. */
  blocking: ProductionMinimumImpact[];
  untrackedLines: string[];
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export async function checkProductionMinimums(supabase: SupabaseClient, companyId: string, runId: string): Promise<ProductionMinimumCheck> {
  const empty: ProductionMinimumCheck = { found: false, impacts: [], warnings: [], blocking: [], untrackedLines: [] };
  const { data: run, error: runError } = await supabase.from("vyron_cost_production_runs").select("id, product_id, planned_qty, actual_qty, status").eq("id", runId).eq("company_id", companyId).maybeSingle();
  if (runError) throw new Error(runError.message);
  if (!run) return empty;

  const { data: lines, error: linesError } = await supabase.from("vyron_cost_production_run_lines").select("line_name, ingredient_id, stock_item_id, planned_qty, actual_qty").eq("production_run_id", runId).eq("company_id", companyId);
  if (linesError) throw new Error(linesError.message);

  // Net change per stock item: consumption out, finished goods in.
  const change = new Map<string, number>();
  const role = new Map<string, "consumed" | "produced">();
  const untrackedLines: string[] = [];
  for (const line of lines || []) {
    let stockItemId = line.stock_item_id ? String(line.stock_item_id) : null;
    if (!stockItemId && line.ingredient_id) {
      const { data } = await supabase.from("vyron_cost_stock_items").select("id").eq("company_id", companyId).eq("entity_id", line.ingredient_id).maybeSingle();
      stockItemId = data?.id ? String(data.id) : null;
    }
    if (!stockItemId) {
      untrackedLines.push(String(line.line_name || "Line"));
      continue;
    }
    const qty = Number(line.planned_qty || 0);
    change.set(stockItemId, round6((change.get(stockItemId) || 0) - qty));
    role.set(stockItemId, "consumed");
  }
  const output = Number(run.status === "Completed" ? run.actual_qty : run.planned_qty) || 0;
  if (run.product_id && output > 0) {
    const { data: fg } = await supabase.from("vyron_cost_stock_items").select("id").eq("company_id", companyId).eq("entity_type", "finished_goods").eq("entity_id", run.product_id).maybeSingle();
    if (fg?.id) {
      const id = String(fg.id);
      change.set(id, round6((change.get(id) || 0) + output));
      if (!role.has(id)) role.set(id, "produced");
    }
  }
  if (!change.size) return { ...empty, found: true, untrackedLines };

  const levels = (await listMinimumLevels(supabase, companyId)).filter((l) => change.has(l.stock_item_id) && l.location === "");
  if (!levels.length) return { ...empty, found: true, untrackedLines };

  const { data: items, error: itemsError } = await supabase.from("vyron_cost_stock_items").select("id, item_code, description, qty_on_hand").eq("company_id", companyId).in("id", levels.map((l) => l.stock_item_id));
  if (itemsError) throw new Error(itemsError.message);
  const byId = new Map((items || []).map((i) => [String(i.id), i]));

  const impacts: ProductionMinimumImpact[] = [];
  for (const level of levels) {
    const item = byId.get(level.stock_item_id);
    if (!item) continue;
    const current = Number(item.qty_on_hand || 0);
    const delta = change.get(level.stock_item_id) || 0;
    const expected = round6(current + delta);
    const status = minimumStatus(expected, level);
    const minimum = Number(level.minimum_qty);
    impacts.push({
      stockItemId: level.stock_item_id,
      itemCode: (item.item_code as string) ?? null,
      description: (item.description as string) ?? null,
      role: role.get(level.stock_item_id) || "consumed",
      currentQty: current,
      change: delta,
      expectedQty: expected,
      minimumQty: minimum,
      warningQty: level.warning_qty === null ? null : Number(level.warning_qty),
      criticalQty: level.critical_qty === null ? null : Number(level.critical_qty),
      status,
      shortfall: Math.max(0, round6(minimum - expected)),
      blocksProduction: Boolean(level.block_production) && expected < minimum,
    });
  }
  impacts.sort((a, b) => b.shortfall - a.shortfall);
  return {
    found: true,
    impacts,
    warnings: impacts.filter((i) => i.status !== "OK"),
    blocking: impacts.filter((i) => i.blocksProduction),
    untrackedLines,
  };
}

/** One sentence per blocking item, for the error a refused start/complete returns. */
export function describeMinimumBlock(blocking: ProductionMinimumImpact[]) {
  return blocking.map((b) => `${b.description || b.itemCode || "Item"} would fall to ${b.expectedQty} (minimum ${b.minimumQty})`).join("; ");
}
