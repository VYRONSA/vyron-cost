import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OrderEngineError, raiseDbError } from "@/lib/order-engine/errors";
import { cleanText } from "@/lib/order-engine/normalize";
import type { CustomerOrderPolicy, OrderEngineActor } from "@/lib/order-engine/types";

/**
 * Customer order policies — optional ordering rules per customer, or a company
 * default. Every rule is OFF until someone switches it on; VYRON assumes no
 * rule for any client. What already exists elsewhere is reused, not copied:
 *   price list        → vyron_customer_price_list_assignments (pricing)
 *   on hold / credit  → vyron_customers.on_hold, credit_limit, status
 *   case size         → vyron_cost_product_pack_sizes (confirmed figures only)
 *   payment terms     → vyron_customers.terms (shown, not enforced)
 * so a policy holds only the rules with no existing home.
 */

export type PolicyInput = {
  requirePo?: boolean;
  requireDeliveryDate?: boolean;
  minOrderValue?: number | null;
  minGpPct?: number | null;
  enforceCaseQuantity?: boolean;
  deliveryWeekdays?: number[] | null;
  orderCutoffTime?: string | null;
  specialInstructions?: string | null;
};

function optionalNumber(value: unknown, label: string, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new OrderEngineError("INVALID_INPUT", `${label} must be between ${min} and ${max}.`);
  return Math.round(n * 100) / 100;
}

export function normalizePolicyInput(input: PolicyInput) {
  const weekdays =
    input.deliveryWeekdays === null || input.deliveryWeekdays === undefined
      ? null
      : [...new Set(input.deliveryWeekdays.map(Number))].sort((a, b) => a - b);
  if (weekdays && (!weekdays.length || weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7))) {
    throw new OrderEngineError("INVALID_INPUT", "Delivery days must be weekdays 1 (Monday) to 7 (Sunday).");
  }
  const cutoff = cleanText(input.orderCutoffTime, 8);
  if (cutoff && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) throw new OrderEngineError("INVALID_INPUT", "The order cut-off must be HH:MM (24-hour).");
  return {
    require_po: input.requirePo === true,
    require_delivery_date: input.requireDeliveryDate === true,
    min_order_value: optionalNumber(input.minOrderValue, "The minimum order value", 0, 1_000_000_000),
    min_gp_pct: optionalNumber(input.minGpPct, "The minimum margin", -100, 100),
    enforce_case_quantity: input.enforceCaseQuantity === true,
    delivery_weekdays: weekdays,
    order_cutoff_time: cutoff,
    special_instructions: cleanText(input.specialInstructions, 2000),
  };
}

export async function listOrderPolicies(supabase: SupabaseClient, companyId: string): Promise<CustomerOrderPolicy[]> {
  const { data, error } = await supabase.from("vyron_customer_order_policies").select("*").eq("company_id", companyId);
  if (error) raiseDbError(error, "List order policies failed");
  return (data || []) as CustomerOrderPolicy[];
}

/** Create or replace the policy for one customer, or the company default (customerId null). */
export async function saveOrderPolicy(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string | null,
  input: PolicyInput,
  actor: OrderEngineActor
): Promise<CustomerOrderPolicy> {
  if (customerId) {
    const { data, error } = await supabase.from("vyron_customers").select("id").eq("company_id", companyId).eq("id", customerId).maybeSingle();
    if (error) raiseDbError(error, "Customer lookup failed");
    if (!data) throw new OrderEngineError("INVALID_INPUT", "The customer does not exist in this company.");
  }
  const fields = normalizePolicyInput(input);
  const now = new Date().toISOString();
  const existing = (await listOrderPolicies(supabase, companyId)).find((row) => (row.customer_id ?? null) === customerId);
  if (existing) {
    const { data, error } = await supabase
      .from("vyron_customer_order_policies")
      .update({ ...fields, updated_by: actor.userId, updated_at: now })
      .eq("company_id", companyId)
      .eq("id", existing.id)
      .select("*");
    if (error) raiseDbError(error, "Save order policy failed");
    return (data as CustomerOrderPolicy[])[0];
  }
  const { data, error } = await supabase
    .from("vyron_customer_order_policies")
    .insert({ id: randomUUID(), company_id: companyId, customer_id: customerId, ...fields, updated_by: actor.userId, created_at: now, updated_at: now })
    .select("*")
    .single();
  if (error) raiseDbError(error, "Save order policy failed");
  return data as CustomerOrderPolicy;
}
