import type { SupabaseClient } from "@supabase/supabase-js";
import { OrderEngineError, isMissingRelation, raiseDbError } from "@/lib/order-engine/errors";
import { cleanText } from "@/lib/order-engine/normalize";
import type { OrderEngineActor } from "@/lib/order-engine/types";

/**
 * Tenant-scoped ordering settings.
 *
 * One row per company (vyron_order_engine_settings), plus one row per channel
 * (vyron_order_channel_settings) for a web store's own VAT basis and the
 * statuses that mean "ready to fulfil".
 *
 * Every setting that represents a business decision is NULL until the business
 * decides it. NULL means "not decided": the engine stops the order rather than
 * inventing a rule. The decision register (decisions.ts) turns these into a
 * list of what is configured and what is still awaited.
 */

const T_SETTINGS = "vyron_order_engine_settings";
const T_CHANNELS = "vyron_order_channel_settings";

export type WebOrdersMode = "history_only" | "fulfil";
export type ShippingTreatment = "not_carried" | "separate_line" | "absorbed";
export type SkuAlignment = "source_equals_vyron" | "mapping_required";

export type OrderEngineSettingsRow = {
  company_id: string;
  b2c_customer_id: string | null;
  product_name_matching: "review" | "off";
  duplicate_po_action: "warn" | "block";
  min_lead_time_days: number | null;
  web_orders_mode: WebOrdersMode | null;
  web_order_statuses: string[] | null;
  web_prices_include_tax: boolean | null;
  shipping_treatment: ShippingTreatment | null;
  sku_alignment: SkuAlignment | null;
  creator_can_approve: boolean | null;
  pdf_extractor: string | null;
  updated_by: string;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
};

export type EffectiveOrderSettings = {
  /** Decided settings (null = not decided). */
  b2cCustomerId: string | null;
  webOrdersMode: WebOrdersMode | null;
  webOrderStatuses: string[] | null;
  webPricesIncludeTax: boolean | null;
  shippingTreatment: ShippingTreatment | null;
  skuAlignment: SkuAlignment | null;
  creatorCanApprove: boolean | null;
  pdfExtractor: string | null;
  minLeadTimeDays: number | null;
  /** Settings with a safe default that is itself a decision. */
  productNameMatching: "review" | "off";
  duplicatePoAction: "warn" | "block";
  /** Whether a settings row exists at all. */
  configured: boolean;
};

export const DEFAULT_ORDER_SETTINGS: EffectiveOrderSettings = {
  b2cCustomerId: null,
  webOrdersMode: null,
  webOrderStatuses: null,
  webPricesIncludeTax: null,
  shippingTreatment: null,
  skuAlignment: null,
  creatorCanApprove: null,
  pdfExtractor: null,
  minLeadTimeDays: null,
  productNameMatching: "review",
  duplicatePoAction: "warn",
  configured: false,
};

function toEffective(row: OrderEngineSettingsRow | null): EffectiveOrderSettings {
  if (!row) return { ...DEFAULT_ORDER_SETTINGS };
  const list = (value: unknown) => (Array.isArray(value) && value.length ? value.map((v) => String(v)) : null);
  return {
    b2cCustomerId: row.b2c_customer_id ?? null,
    webOrdersMode: row.web_orders_mode ?? null,
    webOrderStatuses: list(row.web_order_statuses),
    webPricesIncludeTax: typeof row.web_prices_include_tax === "boolean" ? row.web_prices_include_tax : null,
    shippingTreatment: row.shipping_treatment ?? null,
    skuAlignment: row.sku_alignment ?? null,
    creatorCanApprove: typeof row.creator_can_approve === "boolean" ? row.creator_can_approve : null,
    pdfExtractor: cleanText(row.pdf_extractor, 120),
    minLeadTimeDays: row.min_lead_time_days === null || row.min_lead_time_days === undefined ? null : Number(row.min_lead_time_days),
    productNameMatching: row.product_name_matching === "off" ? "off" : "review",
    duplicatePoAction: row.duplicate_po_action === "block" ? "block" : "warn",
    configured: true,
  };
}

export async function loadOrderSettingsRow(supabase: SupabaseClient, companyId: string): Promise<OrderEngineSettingsRow | null> {
  const { data, error } = await supabase.from(T_SETTINGS).select("*").eq("company_id", companyId).maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    raiseDbError(error, "Load ordering settings failed");
  }
  return (data as OrderEngineSettingsRow) || null;
}

export async function loadOrderSettings(supabase: SupabaseClient, companyId: string): Promise<EffectiveOrderSettings> {
  return toEffective(await loadOrderSettingsRow(supabase, companyId));
}

export type OrderSettingsInput = {
  b2cCustomerId?: string | null;
  productNameMatching?: string;
  duplicatePoAction?: string;
  minLeadTimeDays?: number | string | null;
  webOrdersMode?: string | null;
  webOrderStatuses?: string[] | null;
  webPricesIncludeTax?: boolean | null;
  shippingTreatment?: string | null;
  skuAlignment?: string | null;
  creatorCanApprove?: boolean | null;
  pdfExtractor?: string | null;
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], label: string): T | null => {
  if (value === null || value === undefined || value === "") return null;
  if (!allowed.includes(value as T)) throw new OrderEngineError("INVALID_INPUT", `${label} must be one of: ${allowed.join(", ")}.`);
  return value as T;
};

const statusList = (value: unknown): string[] | null => {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) throw new OrderEngineError("INVALID_INPUT", "Eligible statuses must be a list.");
  const list = [...new Set(value.map((v) => cleanText(v, 60)).filter((v): v is string => Boolean(v)))];
  if (!list.length) return null;
  if (list.length > 40) throw new OrderEngineError("INVALID_INPUT", "At most 40 statuses.");
  return list;
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
  return {
    b2c_customer_id: cleanText(input.b2cCustomerId, 64),
    product_name_matching: name,
    duplicate_po_action: duplicate,
    min_lead_time_days: lead,
    web_orders_mode: oneOf(input.webOrdersMode, ["history_only", "fulfil"] as const, "Web orders"),
    web_order_statuses: statusList(input.webOrderStatuses),
    web_prices_include_tax: typeof input.webPricesIncludeTax === "boolean" ? input.webPricesIncludeTax : null,
    shipping_treatment: oneOf(input.shippingTreatment, ["not_carried", "separate_line", "absorbed"] as const, "Shipping treatment"),
    sku_alignment: oneOf(input.skuAlignment, ["source_equals_vyron", "mapping_required"] as const, "SKU alignment"),
    creator_can_approve: typeof input.creatorCanApprove === "boolean" ? input.creatorCanApprove : null,
    pdf_extractor: cleanText(input.pdfExtractor, 120),
  };
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

// ---------------------------------------------------------------------------
// Channel settings (one row per web store / channel key)
// ---------------------------------------------------------------------------

export type ChannelSettings = {
  id: string;
  company_id: string;
  channel_key: string;
  label: string | null;
  enabled: boolean;
  prices_include_tax: boolean | null;
  eligible_statuses: string[] | null;
  updated_by: string;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
};

export async function listChannelSettings(supabase: SupabaseClient, companyId: string): Promise<ChannelSettings[]> {
  const { data, error } = await supabase.from(T_CHANNELS).select("*").eq("company_id", companyId).order("channel_key", { ascending: true });
  if (error) {
    if (isMissingRelation(error)) return [];
    raiseDbError(error, "Load channel settings failed");
  }
  return ((data || []) as ChannelSettings[]).sort((a, b) => a.channel_key.localeCompare(b.channel_key));
}

export async function loadChannelSettings(supabase: SupabaseClient, companyId: string, channelKey: string): Promise<ChannelSettings | null> {
  const key = cleanText(channelKey, 160);
  if (!key) return null;
  const rows = await listChannelSettings(supabase, companyId);
  return rows.find((row) => row.channel_key.toLowerCase() === key.toLowerCase()) || null;
}

export async function saveChannelSettings(
  supabase: SupabaseClient,
  companyId: string,
  input: { channelKey: string; label?: string | null; enabled?: boolean; pricesIncludeTax?: boolean | null; eligibleStatuses?: string[] | null },
  actor: OrderEngineActor
): Promise<ChannelSettings[]> {
  const channelKey = cleanText(input.channelKey, 160);
  if (!channelKey) throw new OrderEngineError("INVALID_INPUT", "A channel key is required (for example \"woocommerce:main-store\").");
  const now = new Date().toISOString();
  const values = {
    label: cleanText(input.label, 160),
    enabled: input.enabled === true,
    prices_include_tax: typeof input.pricesIncludeTax === "boolean" ? input.pricesIncludeTax : null,
    eligible_statuses: statusList(input.eligibleStatuses),
    updated_by: actor.userId,
    updated_by_name: actor.name,
    updated_at: now,
  };
  const existing = await loadChannelSettings(supabase, companyId, channelKey);
  const { error } = existing
    ? await supabase.from(T_CHANNELS).update(values).eq("company_id", companyId).eq("id", existing.id)
    : await supabase.from(T_CHANNELS).insert({ company_id: companyId, channel_key: channelKey, ...values, created_at: now });
  if (error) {
    if (isMissingRelation(error)) throw new OrderEngineError("NOT_ENABLED", "Channel settings are not enabled on this database yet.");
    raiseDbError(error, "Save channel settings failed");
  }
  return listChannelSettings(supabase, companyId);
}

/**
 * Whether a web-store order may be received at all, and on what basis.
 * Everything not decided is reported, never assumed.
 */
export function webChannelDecision(
  settings: EffectiveOrderSettings,
  channel: ChannelSettings | null
): { receive: boolean; reason: string | null; pricesIncludeTax: boolean | null; eligibleStatuses: string[] | null } {
  const pricesIncludeTax = channel?.prices_include_tax ?? settings.webPricesIncludeTax ?? null;
  const eligibleStatuses = channel?.eligible_statuses ?? settings.webOrderStatuses ?? null;
  if (settings.webOrdersMode === "history_only") {
    return { receive: false, reason: "Web-store orders are configured as historical sales only; they are not received as orders to fulfil.", pricesIncludeTax, eligibleStatuses };
  }
  if (settings.webOrdersMode === null) {
    return { receive: false, reason: "It has not been decided whether web-store orders are fulfilled in VOLORA or kept as history only.", pricesIncludeTax, eligibleStatuses };
  }
  if (channel && channel.enabled === false) {
    return { receive: false, reason: `Channel ${channel.channel_key} is not enabled.`, pricesIncludeTax, eligibleStatuses };
  }
  return { receive: true, reason: null, pricesIncludeTax, eligibleStatuses };
}
