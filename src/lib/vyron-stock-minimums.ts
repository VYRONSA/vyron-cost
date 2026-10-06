import type { SupabaseClient } from "@supabase/supabase-js";
import { writeInventoryAudit } from "@/lib/vyron-inventory";
import { readAllIn, readAllPages } from "@/lib/vyron-supabase-paging";

/**
 * VOLORA — company-configured minimum stock levels.
 *
 * A threshold is a business decision a company makes for one of its own stock items: a minimum,
 * an optional warning level above it, an optional critical level below it, and whether falling
 * below the minimum blocks production. Every company sets its own; nothing is defaulted, and an
 * item with no row has no minimum (it is never reported as below one).
 *
 * Stock has no location dimension today (one balance per company and item), so thresholds are
 * company-wide (location ''). Every change is written to the inventory audit log.
 */

export type MinimumLevel = {
  id: string;
  company_id: string;
  stock_item_id: string;
  location: string;
  minimum_qty: number;
  warning_qty: number | null;
  critical_qty: number | null;
  block_production: boolean;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type MinimumStatus = "OK" | "WARNING" | "BELOW_MINIMUM" | "CRITICAL";

export class MinimumLevelError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const TABLE = "vyron_stock_minimum_levels";
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The status of a quantity against one threshold. */
export function minimumStatus(qty: number, level: Pick<MinimumLevel, "minimum_qty" | "warning_qty" | "critical_qty">): MinimumStatus {
  const q = num(qty);
  if (level.critical_qty !== null && level.critical_qty !== undefined && q <= num(level.critical_qty)) return "CRITICAL";
  if (q < num(level.minimum_qty)) return "BELOW_MINIMUM";
  if (level.warning_qty !== null && level.warning_qty !== undefined && q < num(level.warning_qty)) return "WARNING";
  return "OK";
}

export async function listMinimumLevels(supabase: SupabaseClient, companyId: string): Promise<MinimumLevel[]> {
  return readAllPages<MinimumLevel>((from, to) => supabase.from(TABLE).select("*").eq("company_id", companyId).order("id", { ascending: true }).range(from, to));
}

export type MinimumLevelRow = MinimumLevel & {
  item_code: string | null;
  description: string | null;
  entity_type: string | null;
  unit: string | null;
  qty_on_hand: number;
  status: MinimumStatus;
  shortfall: number;
};

/** Every configured threshold with the item's current stock and status. */
export async function listMinimumLevelStatus(supabase: SupabaseClient, companyId: string): Promise<MinimumLevelRow[]> {
  const levels = await listMinimumLevels(supabase, companyId);
  if (!levels.length) return [];
  const items = await readAllIn<Record<string, unknown>>(
    [...new Set(levels.map((l) => l.stock_item_id))],
    (chunk, from, to) =>
      supabase.from("vyron_cost_stock_items").select("id, item_code, description, entity_type, unit, qty_on_hand").eq("company_id", companyId).in("id", chunk).order("id", { ascending: true }).range(from, to)
  );
  const byId = new Map(items.map((i) => [String(i.id), i]));
  return levels
    .filter((l) => byId.has(l.stock_item_id))
    .map((l) => {
      const item = byId.get(l.stock_item_id)!;
      const qty = num(item.qty_on_hand);
      return {
        ...l,
        minimum_qty: num(l.minimum_qty),
        warning_qty: l.warning_qty === null ? null : num(l.warning_qty),
        critical_qty: l.critical_qty === null ? null : num(l.critical_qty),
        item_code: (item.item_code as string) ?? null,
        description: (item.description as string) ?? null,
        entity_type: (item.entity_type as string) ?? null,
        unit: (item.unit as string) ?? null,
        qty_on_hand: qty,
        status: minimumStatus(qty, l),
        shortfall: Math.max(0, Math.round((num(l.minimum_qty) - qty) * 1e6) / 1e6),
      };
    });
}

export type MinimumLevelInput = {
  stockItemId: string;
  minimumQty: number;
  warningQty?: number | null;
  criticalQty?: number | null;
  blockProduction?: boolean;
};

function validate(input: MinimumLevelInput) {
  const min = Number(input.minimumQty);
  if (!Number.isFinite(min) || min < 0) throw new MinimumLevelError("Minimum quantity must be zero or more.");
  const warn = input.warningQty === null || input.warningQty === undefined || String(input.warningQty) === "" ? null : Number(input.warningQty);
  const crit = input.criticalQty === null || input.criticalQty === undefined || String(input.criticalQty) === "" ? null : Number(input.criticalQty);
  if (warn !== null && (!Number.isFinite(warn) || warn < min)) throw new MinimumLevelError("Warning quantity must be at or above the minimum.");
  if (crit !== null && (!Number.isFinite(crit) || crit < 0 || crit > min)) throw new MinimumLevelError("Critical quantity must be between zero and the minimum.");
  return { min, warn, crit, block: Boolean(input.blockProduction) };
}

/** Create or change the threshold for one of this company's stock items. Audited. */
export async function saveMinimumLevel(supabase: SupabaseClient, companyId: string, input: MinimumLevelInput, actor: string): Promise<MinimumLevel> {
  const { min, warn, crit, block } = validate(input);
  const { data: item, error: itemError } = await supabase.from("vyron_cost_stock_items").select("id, item_code").eq("id", input.stockItemId).eq("company_id", companyId).maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item) throw new MinimumLevelError("Stock item not found.", 404);

  const { data: existing, error: existingError } = await supabase.from(TABLE).select("*").eq("company_id", companyId).eq("stock_item_id", input.stockItemId).eq("location", "").maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const now = new Date().toISOString();
  const values = { minimum_qty: min, warning_qty: warn, critical_qty: crit, block_production: block, updated_by: actor, updated_at: now };
  let saved: MinimumLevel;
  if (existing) {
    const { data, error } = await supabase.from(TABLE).update(values).eq("id", existing.id).eq("company_id", companyId).select("*").single();
    if (error) throw new Error(error.message);
    saved = data as MinimumLevel;
  } else {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ company_id: companyId, stock_item_id: input.stockItemId, location: "", ...values, created_by: actor, created_at: now })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    saved = data as MinimumLevel;
  }
  await writeInventoryAudit(supabase, {
    companyId,
    stockItemId: input.stockItemId,
    eventType: existing ? "Minimum Level Changed" : "Minimum Level Set",
    actor,
    fieldName: "minimum_level",
    oldValue: existing ? JSON.stringify({ minimum: existing.minimum_qty, warning: existing.warning_qty, critical: existing.critical_qty, block: existing.block_production }) : undefined,
    newValue: JSON.stringify({ minimum: min, warning: warn, critical: crit, block }),
    detail: `${item.item_code || "Stock item"}: minimum ${min}${warn !== null ? `, warning ${warn}` : ""}${crit !== null ? `, critical ${crit}` : ""}${block ? ", blocks production" : ""}`,
  });
  return saved;
}

/** Remove a threshold (the item then has no minimum). Audited. */
export async function deleteMinimumLevel(supabase: SupabaseClient, companyId: string, id: string, actor: string) {
  const { data: existing, error } = await supabase.from(TABLE).select("*").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!existing) throw new MinimumLevelError("Minimum level not found.", 404);
  const { error: delError } = await supabase.from(TABLE).delete().eq("id", id).eq("company_id", companyId);
  if (delError) throw new Error(delError.message);
  await writeInventoryAudit(supabase, {
    companyId,
    stockItemId: existing.stock_item_id,
    eventType: "Minimum Level Removed",
    actor,
    fieldName: "minimum_level",
    oldValue: JSON.stringify({ minimum: existing.minimum_qty, warning: existing.warning_qty, critical: existing.critical_qty, block: existing.block_production }),
    detail: "Minimum level removed.",
  });
}
