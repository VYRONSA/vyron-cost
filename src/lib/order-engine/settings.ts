import type { SupabaseClient } from "@supabase/supabase-js";
import { OrderEngineError, isMissingRelation, raiseDbError } from "@/lib/order-engine/errors";
import { cleanText } from "@/lib/order-engine/normalize";
import type { OrderEngineActor, OrderEngineSettings } from "@/lib/order-engine/types";

/**
 * Tenant-scoped ordering settings (vyron_order_engine_settings).
 *
 * One row per company, read only for that company. A company without a row —
 * or a database without the table — gets the conservative defaults below:
 * no B2C account (web orders from unknown customers stop in Exceptions),
 * exact name matching only with review, repeated POs warned, lead time
 * unchecked. Nothing about a tenant is inferred.
 */

const T_SETTINGS = "vyron_order_engine_settings";

export type EffectiveOrderSettings = {
  b2cCustomerId: string | null;
  productNameMatching: "review" | "off";
  duplicatePoAction: "warn" | "block";
  minLeadTimeDays: number | null;
  /** Whether a row exists (false: all defaults). */
  configured: boolean;
};

export const DEFAULT_ORDER_SETTINGS: EffectiveOrderSettings = {
  b2cCustomerId: null,
  productNameMatching: "review",
  duplicatePoAction: "warn",
  minLeadTimeDays: null,
  configured: false,
};

function toEffective(row: OrderEngineSettings | null): EffectiveOrderSettings {
  if (!row) return { ...DEFAULT_ORDER_SETTINGS };
  return {
    b2cCustomerId: row.b2c_customer_id ?? null,
    productNameMatching: row.product_name_matching === "off" ? "off" : "review",
    duplicatePoAction: row.duplicate_po_action === "block" ? "block" : "warn",
    minLeadTimeDays: row.min_lead_time_days === null || row.min_lead_time_days === undefined ? null : Number(row.min_lead_time_days),
    configured: true,
  };
}

export async function loadOrderSettingsRow(supabase: SupabaseClient, companyId: string): Promise<OrderEngineSettings | null> {
  const { data, error } = await supabase.from(T_SETTINGS).select("*").eq("company_id", companyId).maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    raiseDbError(error, "Load ordering settings failed");
  }
  return (data as OrderEngineSettings) || null;
}

export async function loadOrderSettings(supabase: SupabaseClient, companyId: string): Promise<EffectiveOrderSettings> {
  return toEffective(await loadOrderSettingsRow(supabase, companyId));
}

export type OrderSettingsInput = {
  b2cCustomerId?: string | null;
  productNameMatching?: string;
  duplicatePoAction?: string;
  minLeadTimeDays?: number | string | null;
};

export function normalizeSettingsInput(input: OrderSettingsInput) {
  const name = input.productNameMatching ?? "review";
  if (name !== "review" && name !== "off") throw new OrderEngineError("INVALID_INPUT", "Product-name matching must be 'review' or 'off'.");
  const duplicate = input.duplicatePoAction ?? "warn";
  if (duplicate !== "warn" && duplicate !== "block") throw new OrderEngineError("INVALID_INPUT", "Repeated-PO handling must be 'warn' or 'block'.");
  let lead: number | null = null;
  if (input.minLeadTimeDays !== null && input.minLeadTimeDays !== undefined && String(input.minLeadTimeDays).trim() !== "") {
    lead = Number(input.minLeadTimeDays);
    if (!Number.isInteger(lead) || lead < 0 || lead > 90) throw new OrderEngineError("INVALID_INPUT", "Lead time must be a whole number of days between 0 and 90.");
  }
  const b2c = cleanText(input.b2cCustomerId, 64);
  return { b2c_customer_id: b2c, product_name_matching: name, duplicate_po_action: duplicate, min_lead_time_days: lead };
}

/** Save the company's settings. The B2C account must be a customer of this company. */
export async function saveOrderSettings(
  supabase: SupabaseClient,
  companyId: string,
  input: OrderSettingsInput,
  actor: OrderEngineActor
): Promise<EffectiveOrderSettings> {
  const values = normalizeSettingsInput(input);
  if (values.b2c_customer_id) {
    const { data, error } = await supabase
      .from("vyron_customers")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", values.b2c_customer_id)
      .maybeSingle();
    if (error) raiseDbError(error, "Customer lookup failed");
    if (!data) throw new OrderEngineError("INVALID_INPUT", "The B2C account must be a customer of this company.");
  }
  const now = new Date().toISOString();
  const existing = await loadOrderSettingsRow(supabase, companyId);
  const row = { ...values, updated_by: actor.userId, updated_by_name: actor.name, updated_at: now };
  const { error } = existing
    ? await supabase.from(T_SETTINGS).update(row).eq("company_id", companyId)
    : await supabase.from(T_SETTINGS).insert({ company_id: companyId, ...row, created_at: now });
  if (error) {
    if (isMissingRelation(error)) throw new OrderEngineError("NOT_ENABLED", "Ordering settings are not enabled on this database yet.");
    raiseDbError(error, "Save ordering settings failed");
  }
  return loadOrderSettings(supabase, companyId);
}
