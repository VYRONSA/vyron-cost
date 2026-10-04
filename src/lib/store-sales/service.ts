import type { SupabaseClient } from "@supabase/supabase-js";
import { createCustomer, createCustomerInvoice, resolveDefaultVatRate, type CustomerInvoiceLineInput, type CustomerInvoiceRow } from "@/lib/vyron-customer-invoices";
import { resolveCustomerProductPrice } from "@/lib/vyron-customer-price-lists";
import { createProductMatcher, linkedEntityIds, matchCustomer } from "@/lib/order-engine/matching";
import { normalizeEmail } from "@/lib/order-engine/normalize";
import type { ConnectionRef, StoreConnector } from "@/lib/store-sales/connector";
import { canonicalStoreUrl, credentialState, type CredentialState } from "@/lib/store-sales/credentials";
import { StoreApiError, StoreSyncError, errorMessage, isUniqueViolation, raiseDb } from "@/lib/store-sales/errors";
import { storeRuntime } from "@/lib/store-sales/runtime";
import { planRefundCredit, planSaleInvoice, type SaleIssue } from "@/lib/store-sales/sales";
import { shopifyConnector } from "@/lib/store-sales/shopify/connector";
import { CHANNEL_LABEL, STORE_CHANNELS, saleFingerprint, type SaleRefund, type StoreChannel, type StoreSale } from "@/lib/store-sales/types";
import { wooCommerceConnector } from "@/lib/store-sales/woocommerce/connector";

/**
 * Online-store sales sync — ONE engine for every channel.
 *
 *   Shopify webhook ─┐                       ┌─ Shopify connector (GraphQL)
 *   Woo webhook ─────┼─▶ vyron_store_orders ─┤
 *   import / retry ──┘   (due)               └─ WooCommerce connector (REST)
 *        └─▶ process: fetch the order → map customer and products (the Order
 *            Engine's deterministic ladders) → plan the invoice and reconcile
 *            it to the store's own figures → createCustomerInvoice (the SAME
 *            function a sale captured in VOLORA uses), issued as Posted → each
 *            refund becomes a credit note against it in the same tables.
 *
 * Scope is the sales and credits only: no stock is moved, nothing is sent to
 * Xero, no FoodSock process is integrated. A sale recorded this way counts in
 * every revenue, VAT and GP report exactly as VOLORA's own invoice import does.
 *
 * Every read and write is filtered by the connection's company. Stores are
 * only ever read. A sale that cannot be recorded exactly stops in
 * NEEDS_ATTENTION with its reason; nothing is guessed, nothing half-written.
 */

export const SYNC_ACTOR = "store-sales-sync";

const CONNECTORS: Record<StoreChannel, StoreConnector> = { SHOPIFY: shopifyConnector, WOOCOMMERCE: wooCommerceConnector };
export function connectorFor(channel: StoreChannel): StoreConnector {
  return CONNECTORS[channel];
}

const T_CONNECTIONS = "vyron_store_connections";
const T_ORDERS = "vyron_store_orders";
const T_REFUNDS = "vyron_store_refunds";
const T_DELIVERIES = "vyron_store_webhook_deliveries";
const T_BACKFILLS = "vyron_store_backfills";
const T_EVENTS = "vyron_store_sync_events";

const LEASE_MS = 120_000;
const MAX_ATTEMPTS = 8;
const BACKOFF_SECONDS = [60, 300, 900, 3600, 3 * 3600, 6 * 3600, 12 * 3600, 24 * 3600];
const PAGE_SIZE = 50;
const BACKFILL_MAX_FAILURES = 5;
/** First catch-up looks back this far; later ones from the previous catch-up (with overlap). */
const RECONCILE_LOOKBACK_MS = 72 * 3600 * 1000;
const RECONCILE_OVERLAP_MS = 15 * 60 * 1000;
const RECONCILE_MAX_PAGES = 10;

/** The store statuses that are a completed sale. Anything not yet paid waits; the rest is not a sale. */
export const SALE_STATUSES: Record<StoreChannel, string[]> = {
  SHOPIFY: ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED", "REFUNDED"],
  WOOCOMMERCE: ["PROCESSING", "COMPLETED", "REFUNDED"],
};
/** Statuses that can still become a sale (payment not yet taken): waited for, never skipped. */
const WAITING_STATUSES = ["PENDING", "AUTHORIZED", "ON_HOLD"];

export type ConnectionStatus = "DISABLED" | "ACTIVE" | "SUSPENDED";
export type OrderSyncStatus = "PENDING" | "WAITING" | "IMPORTED" | "NEEDS_ATTENTION" | "FAILED" | "SKIPPED";

export type StoreConnection = {
  id: string;
  company_id: string;
  channel: StoreChannel;
  store_url: string;
  store_key: string;
  display_name: string | null;
  status: ConnectionStatus;
  /** The store's own "online sales" customer: shoppers not matched to a VOLORA customer are booked here. */
  default_customer_id: string | null;
  expected_currency: string;
  webhook_subscriptions: Array<{ id: string; topic: string; uri: string }>;
  last_webhook_at: string | null;
  last_sync_at: string | null;
  last_reconciled_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type LineMapEntry = { lineId: string; productId: string; costPerUnit: number };

export type StoreOrderRow = {
  id: string;
  company_id: string;
  connection_id: string;
  channel: StoreChannel;
  external_order_id: string;
  order_number: string | null;
  order_created_at: string | null;
  financial_status: string | null;
  cancelled_at: string | null;
  currency: string | null;
  total_price: number | null;
  customer_display: string | null;
  status: OrderSyncStatus;
  issues: SaleIssue[];
  issue_codes: string[];
  customer_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  line_map: LineMapEntry[];
  sale_fingerprint: string | null;
  attempts: number;
  next_attempt_at: string | null;
  locked_until: string | null;
  last_error: string | null;
  last_event_at: string | null;
  imported_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type StoreBackfillRow = {
  id: string;
  company_id: string;
  connection_id: string;
  status: "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED";
  created_from: string;
  created_to: string | null;
  cursor: string | null;
  pages: number;
  orders_seen: number;
  attempts: number;
  last_error: string | null;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
  version: number;
};

const nowIso = () => new Date(storeRuntime.now()).toISOString();
const ref = (connection: StoreConnection): ConnectionRef => ({ channel: connection.channel, store_url: connection.store_url, company_id: connection.company_id });
/** The catalogue system the Order Engine's ladders and vyron_import_source_links use: shopify:<key> / woocommerce:<key>. */
export const catalogSystem = (connection: Pick<StoreConnection, "channel" | "store_key">) => `${connection.channel.toLowerCase()}:${connection.store_key}`;
const orderReference = (connection: StoreConnection, orderId: string) => `${catalogSystem(connection)}:order:${orderId}`;
const refundReference = (connection: StoreConnection, refundId: string) => `${catalogSystem(connection)}:refund:${refundId}`;
const connectionTag = (connection: Pick<StoreConnection, "id">) => connection.id.replace(/-/g, "").slice(0, 6).toUpperCase();

/**
 * Invoice numbers are globally unique in the database. Shopify order and refund
 * ids are unique across Shopify; WooCommerce ids are only unique within one
 * store, so its numbers carry a tag of the connection.
 */
export function saleInvoiceNumber(connection: Pick<StoreConnection, "id" | "channel">, orderId: string): string {
  return connection.channel === "SHOPIFY" ? `SHP-${orderId}` : `WC-${orderId}-${connectionTag(connection)}`;
}
export function creditInvoiceNumber(connection: Pick<StoreConnection, "id" | "channel">, refundId: string): string {
  return connection.channel === "SHOPIFY" ? `SHPR-${refundId}` : `WCR-${refundId}-${connectionTag(connection)}`;
}

async function writeEvent(
  supabase: SupabaseClient,
  event: { companyId: string; connectionId?: string | null; orderRowId?: string | null; type: string; actor: string; detail?: string | null; metadata?: Record<string, unknown> }
): Promise<void> {
  const { error } = await supabase.from(T_EVENTS).insert({
    company_id: event.companyId,
    connection_id: event.connectionId ?? null,
    store_order_row_id: event.orderRowId ?? null,
    event_type: event.type,
    actor: event.actor,
    detail: event.detail ?? null,
    metadata: event.metadata ?? {},
    created_at: nowIso(),
  });
  if (error) raiseDb(error, "Sync audit write failed");
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export function credentialStateFor(connection: Pick<StoreConnection, "channel" | "store_url" | "company_id">): CredentialState {
  return credentialState(storeRuntime.credentials(connection.channel, connection.store_url), connection.company_id);
}

export async function loadConnectionByStore(supabase: SupabaseClient, channel: StoreChannel, storeUrl: string): Promise<StoreConnection | null> {
  const { data, error } = await supabase.from(T_CONNECTIONS).select("*").eq("channel", channel).eq("store_url", storeUrl).maybeSingle();
  if (error) raiseDb(error, "Store lookup failed");
  return (data as StoreConnection) || null;
}

export async function loadConnection(supabase: SupabaseClient, companyId: string, id: string): Promise<StoreConnection> {
  const { data, error } = await supabase.from(T_CONNECTIONS).select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) raiseDb(error, "Store lookup failed");
  if (!data) throw new StoreSyncError("NOT_FOUND", "Store connection not found.");
  return data as StoreConnection;
}

async function countWhere(
  supabase: SupabaseClient,
  table: string,
  filters: Array<[string, string | string[]]>,
  options: { like?: [string, string]; notNull?: string } = {}
): Promise<number> {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of filters) query = Array.isArray(value) ? query.in(column, value) : query.eq(column, value);
  if (options.like) query = query.like(options.like[0], options.like[1]);
  if (options.notNull) query = query.not(options.notNull, "is", null);
  const { data, count, error } = await query;
  if (error) raiseDb(error, "Count failed");
  return typeof count === "number" ? count : Array.isArray(data) ? data.length : 0;
}

export type ConnectionHealth = "NOT_CONNECTED" | "CONNECTED" | "ERROR";

export type ConnectionView = StoreConnection & {
  credentials: CredentialState;
  health: ConnectionHealth;
  healthReason: string | null;
  totals: { ordersImported: number; invoicesImported: number; refunds: number; needsAttention: number };
};

export function connectionHealth(connection: StoreConnection, credentials: CredentialState): { health: ConnectionHealth; reason: string | null } {
  if (credentials === "OTHER_COMPANY") return { health: "ERROR", reason: "The server credentials for this store belong to another company." };
  if (credentials === "MISSING") return { health: "NOT_CONNECTED", reason: "No credentials for this store on the server yet." };
  if (connection.status === "SUSPENDED") return { health: "ERROR", reason: "Suspended." };
  if (connection.status !== "ACTIVE") return { health: "NOT_CONNECTED", reason: "Sync is not active." };
  if (connection.last_failure_at && (!connection.last_success_at || connection.last_failure_at >= connection.last_success_at)) {
    return { health: "ERROR", reason: connection.last_failure_reason || "The last call to the store failed." };
  }
  return { health: "CONNECTED", reason: null };
}

export async function describeConnection(supabase: SupabaseClient, connection: StoreConnection): Promise<ConnectionView> {
  const base: Array<[string, string]> = [
    ["company_id", connection.company_id],
    ["connection_id", connection.id],
  ];
  const [ordersImported, invoicesImported, refunds, needsAttention] = await Promise.all([
    countWhere(supabase, T_ORDERS, base, { notNull: "invoice_id" }),
    countWhere(supabase, "vyron_customer_invoices", [["company_id", connection.company_id], ["source_channel", connection.channel]], { like: ["source_reference", `${catalogSystem(connection)}:order:%`] }),
    countWhere(supabase, T_REFUNDS, base),
    countWhere(supabase, T_ORDERS, [...base, ["status", "NEEDS_ATTENTION"]]),
  ]);
  const credentials = credentialStateFor(connection);
  const { health, reason } = connectionHealth(connection, credentials);
  return { ...connection, credentials, health, healthReason: reason, totals: { ordersImported, invoicesImported, refunds, needsAttention } };
}

export async function listConnections(supabase: SupabaseClient, companyId: string): Promise<ConnectionView[]> {
  const { data, error } = await supabase.from(T_CONNECTIONS).select("*").eq("company_id", companyId).order("created_at", { ascending: true });
  if (error) raiseDb(error, "List stores failed");
  return Promise.all(((data || []) as StoreConnection[]).map((row) => describeConnection(supabase, row)));
}

export type ConnectionInput = { id?: string | null; channel?: unknown; storeUrl?: unknown; displayName?: unknown; defaultCustomerId?: unknown };

async function assertCustomerInCompany(supabase: SupabaseClient, companyId: string, customerId: string): Promise<{ id: string; customer_name: string | null }> {
  const { data, error } = await supabase.from("vyron_customers").select("id, customer_name").eq("company_id", companyId).eq("id", customerId).maybeSingle();
  if (error) raiseDb(error, "Customer lookup failed");
  if (!data) throw new StoreSyncError("INVALID_INPUT", "That customer does not exist in this company.");
  return data as { id: string; customer_name: string | null };
}

/** A short key from the store address (shopify:<key> / woocommerce:<key> in references and mappings). */
function storeKeyFor(channel: StoreChannel, storeUrl: string): string {
  const host = storeUrl.replace(/^https:\/\//, "");
  const base = channel === "SHOPIFY" ? host.replace(/\.myshopify\.com$/, "") : host.replace(/^www\./, "");
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "store"
  );
}

/**
 * Connect a store (starts DISABLED) or rename it. Creating a store also creates
 * its "online sales" customer, so every sale has a customer from the first
 * order on, without anyone having to decide or map one. Never touches
 * credentials, never activates.
 */
export async function saveConnection(supabase: SupabaseClient, companyId: string, input: ConnectionInput, actor: string): Promise<StoreConnection> {
  const now = nowIso();
  if (input.id) {
    const existing = await loadConnection(supabase, companyId, String(input.id));
    const patch: Record<string, unknown> = {};
    if (input.displayName !== undefined) patch.display_name = String(input.displayName ?? "").trim().slice(0, 120) || null;
    if (input.defaultCustomerId !== undefined && String(input.defaultCustomerId || "").trim()) {
      patch.default_customer_id = (await assertCustomerInCompany(supabase, companyId, String(input.defaultCustomerId).trim())).id;
    }
    const { data, error } = await supabase.from(T_CONNECTIONS).update({ ...patch, updated_by: actor, updated_at: now }).eq("company_id", companyId).eq("id", existing.id).select("*").single();
    if (error) raiseDb(error, "Save store failed");
    await writeEvent(supabase, { companyId, connectionId: existing.id, type: "SETTINGS_CHANGED", actor, metadata: { fields: Object.keys(patch) } });
    return data as StoreConnection;
  }

  const channel = String(input.channel || "").toUpperCase() as StoreChannel;
  if (!STORE_CHANNELS.includes(channel)) throw new StoreSyncError("INVALID_INPUT", "Choose Shopify or WooCommerce.");
  const storeUrl = canonicalStoreUrl(channel, input.storeUrl);
  if (!storeUrl) {
    throw new StoreSyncError(
      "INVALID_INPUT",
      channel === "SHOPIFY" ? "Enter the store's myshopify.com domain, e.g. your-store.myshopify.com." : "Enter the WooCommerce site address starting with https://, e.g. https://shop.example.co.za."
    );
  }
  const existingStore = await loadConnectionByStore(supabase, channel, storeUrl);
  if (existingStore) throw new StoreSyncError("CONFLICT", "That store is already connected.");
  const { data: keys, error: keyError } = await supabase.from(T_CONNECTIONS).select("store_key").eq("company_id", companyId).eq("channel", channel);
  if (keyError) raiseDb(keyError, "Store lookup failed");
  const taken = new Set(((keys || []) as Array<{ store_key: string }>).map((k) => k.store_key));
  const base = storeKeyFor(channel, storeUrl);
  let storeKey = base;
  for (let n = 2; taken.has(storeKey); n++) storeKey = `${base}-${n}`;

  const displayName = String(input.displayName ?? "").trim().slice(0, 120) || storeUrl.replace(/^https:\/\//, "");
  const customer = await createCustomer(supabase, companyId, { customerName: `${displayName} — ${CHANNEL_LABEL[channel]} online sales`.slice(0, 200), category: "Online store" });
  const customerId = String((customer as { id: string }).id);

  const { data, error } = await supabase
    .from(T_CONNECTIONS)
    .insert({
      company_id: companyId,
      channel,
      store_url: storeUrl,
      store_key: storeKey,
      display_name: displayName,
      status: "DISABLED",
      default_customer_id: customerId,
      expected_currency: "ZAR",
      webhook_subscriptions: [],
      created_by: actor,
      updated_by: actor,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) {
    if (isUniqueViolation(error)) throw new StoreSyncError("CONFLICT", "That store is already connected.");
    raiseDb(error, "Create store failed");
  }
  const created = data as StoreConnection;
  await writeEvent(supabase, { companyId, connectionId: created.id, type: "STORE_CONNECTED", actor, detail: `${CHANNEL_LABEL[channel]} ${storeUrl} connected (disabled); online-sales customer created.` });
  return created;
}

/** Turn a store's sync on or off. Activation needs this company's server credentials. */
export async function setConnectionStatus(supabase: SupabaseClient, companyId: string, id: string, status: ConnectionStatus, actor: string): Promise<StoreConnection> {
  if (!["DISABLED", "ACTIVE", "SUSPENDED"].includes(status)) throw new StoreSyncError("INVALID_INPUT", "Unknown status.");
  const connection = await loadConnection(supabase, companyId, id);
  if (status === "ACTIVE") {
    const state = credentialStateFor(connection);
    if (state === "MISSING") throw new StoreSyncError("NOT_CONFIGURED", `No server credentials are configured for ${connection.store_url}.`);
    if (state === "OTHER_COMPANY") throw new StoreSyncError("NOT_CONFIGURED", `The server credentials for ${connection.store_url} are bound to another company.`);
    await assertNoActiveOrderIntakeChannel(supabase, companyId, connection);
  }
  const { data, error } = await supabase
    .from(T_CONNECTIONS)
    .update({ status, updated_by: actor, updated_at: nowIso() })
    .eq("company_id", companyId)
    .eq("id", connection.id)
    .select("*")
    .single();
  if (error) raiseDb(error, "Change store status failed");
  await writeEvent(supabase, { companyId, connectionId: connection.id, type: `STORE_${status}`, actor, detail: `${connection.store_url}: ${connection.status} → ${status}.` });
  return data as StoreConnection;
}

/**
 * One store, one path. If the Order Inbox's web-store channel is active for
 * the same store, its orders would become sales orders AND sales here, and be
 * counted twice once invoiced.
 */
async function assertNoActiveOrderIntakeChannel(supabase: SupabaseClient, companyId: string, connection: StoreConnection): Promise<void> {
  const { data, error } = await supabase.from("vyron_order_channel_settings").select("activation_state").eq("company_id", companyId).eq("channel_key", catalogSystem(connection));
  if (error) return; // the Order Engine tables are not present: nothing to collide with
  if (((data || []) as Array<{ activation_state?: string }>).some((row) => row.activation_state === "ACTIVE")) {
    throw new StoreSyncError("CONFLICT", `The Order Inbox web-store channel ${catalogSystem(connection)} is active. Suspend it first: a store's orders must enter VOLORA one way only.`);
  }
}

async function recordSuccess(supabase: SupabaseClient, connection: StoreConnection, extra: Record<string, unknown> = {}) {
  await supabase.from(T_CONNECTIONS).update({ last_success_at: nowIso(), ...extra }).eq("company_id", connection.company_id).eq("id", connection.id);
}

async function recordFailure(supabase: SupabaseClient, connection: StoreConnection, reason: string) {
  await supabase
    .from(T_CONNECTIONS)
    .update({ last_failure_at: nowIso(), last_failure_reason: reason.slice(0, 500) })
    .eq("company_id", connection.company_id)
    .eq("id", connection.id);
}

/** Test Connection: one read with this company's credentials. Recorded either way. */
export async function testConnection(supabase: SupabaseClient, companyId: string, id: string, actor: string) {
  const connection = await loadConnection(supabase, companyId, id);
  try {
    const result = await connectorFor(connection.channel).testConnection(ref(connection));
    await recordSuccess(supabase, connection);
    await writeEvent(supabase, { companyId, connectionId: connection.id, type: "CONNECTION_TESTED", actor, detail: result.detail });
    const currencyWarning = result.currency && result.currency !== connection.expected_currency ? `The store uses ${result.currency}; VOLORA expects ${connection.expected_currency}.` : null;
    return { ok: true as const, ...result, currencyWarning };
  } catch (error) {
    await recordFailure(supabase, connection, errorMessage(error));
    await writeEvent(supabase, { companyId, connectionId: connection.id, type: "CONNECTION_TEST_FAILED", actor, detail: errorMessage(error).slice(0, 500) });
    throw error;
  }
}

export async function registerWebhooks(supabase: SupabaseClient, companyId: string, id: string, callbackUrl: string, actor: string): Promise<StoreConnection> {
  const connection = await loadConnection(supabase, companyId, id);
  const connector = connectorFor(connection.channel);
  if (!connector.registerWebhooks) {
    throw new StoreSyncError("INVALID_INPUT", `${CHANNEL_LABEL[connection.channel]} webhooks are created in the store's own admin (see the setup guide); VOLORA's key is read-only.`);
  }
  const subscriptions = await connector.registerWebhooks(ref(connection), callbackUrl);
  const { data, error } = await supabase
    .from(T_CONNECTIONS)
    .update({ webhook_subscriptions: subscriptions, updated_by: actor, updated_at: nowIso() })
    .eq("company_id", companyId)
    .eq("id", connection.id)
    .select("*")
    .single();
  if (error) raiseDb(error, "Save webhook subscriptions failed");
  await writeEvent(supabase, { companyId, connectionId: connection.id, type: "WEBHOOKS_REGISTERED", actor, detail: subscriptions.map((s) => s.topic).join(", ") });
  return data as StoreConnection;
}

// ---------------------------------------------------------------------------
// Webhook intake (fast: record and acknowledge; processing happens after)
// ---------------------------------------------------------------------------

export type WebhookDelivery = { deliveryId: string; topic: string; externalOrderId: string | null };

/** Record a verified delivery and mark its order due. A delivery received twice does nothing the second time. */
export async function recordWebhookDelivery(supabase: SupabaseClient, connection: StoreConnection, delivery: WebhookDelivery): Promise<{ duplicate: boolean; orderRowId: string | null }> {
  const now = nowIso();
  const { error } = await supabase.from(T_DELIVERIES).insert({
    company_id: connection.company_id,
    connection_id: connection.id,
    delivery_id: delivery.deliveryId,
    topic: delivery.topic,
    external_order_id: delivery.externalOrderId,
    received_at: now,
  });
  if (error) {
    if (isUniqueViolation(error)) {
      await writeEvent(supabase, {
        companyId: connection.company_id,
        connectionId: connection.id,
        type: "DUPLICATE_DELIVERY",
        actor: SYNC_ACTOR,
        detail: `Webhook ${delivery.topic} delivered again; ignored.`,
        metadata: { deliveryId: delivery.deliveryId, externalOrderId: delivery.externalOrderId },
      });
      return { duplicate: true, orderRowId: null };
    }
    raiseDb(error, "Record webhook failed");
  }
  await supabase.from(T_CONNECTIONS).update({ last_webhook_at: now }).eq("company_id", connection.company_id).eq("id", connection.id);
  if (!delivery.externalOrderId) return { duplicate: false, orderRowId: null };
  const row = await markOrderDue(supabase, connection, delivery.externalOrderId, `webhook ${delivery.topic}`);
  return { duplicate: false, orderRowId: row.id };
}

/** Create the order's sync row if new, and make it due for processing now. */
export async function markOrderDue(supabase: SupabaseClient, connection: StoreConnection, externalOrderId: string, reason: string): Promise<StoreOrderRow> {
  const id = String(externalOrderId).trim();
  if (!/^\d{1,20}$/.test(id)) throw new StoreSyncError("INVALID_INPUT", "A store order id is numeric.");
  const now = nowIso();
  const existing = await findOrderRow(supabase, connection, id);
  if (existing) {
    const { data, error } = await supabase
      .from(T_ORDERS)
      .update({ next_attempt_at: now, last_event_at: now, updated_at: now })
      .eq("company_id", connection.company_id)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) raiseDb(error, "Mark order due failed");
    return data as StoreOrderRow;
  }
  const { data, error } = await supabase
    .from(T_ORDERS)
    .insert({
      company_id: connection.company_id,
      connection_id: connection.id,
      channel: connection.channel,
      external_order_id: id,
      status: "PENDING",
      issues: [],
      issue_codes: [],
      line_map: [],
      attempts: 0,
      next_attempt_at: now,
      locked_until: null,
      last_event_at: now,
      version: 1,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      const winner = await findOrderRow(supabase, connection, id); // a concurrent delivery created it
      if (winner) return winner;
    }
    raiseDb(error, "Record order failed");
  }
  const created = data as StoreOrderRow;
  await writeEvent(supabase, { companyId: connection.company_id, connectionId: connection.id, orderRowId: created.id, type: "ORDER_RECEIVED", actor: SYNC_ACTOR, detail: `${CHANNEL_LABEL[connection.channel]} order ${id} received (${reason}).` });
  return created;
}

async function findOrderRow(supabase: SupabaseClient, connection: StoreConnection, externalOrderId: string): Promise<StoreOrderRow | null> {
  const { data, error } = await supabase
    .from(T_ORDERS)
    .select("*")
    .eq("company_id", connection.company_id)
    .eq("connection_id", connection.id)
    .eq("external_order_id", externalOrderId)
    .maybeSingle();
  if (error) raiseDb(error, "Order lookup failed");
  return (data as StoreOrderRow) || null;
}

// ---------------------------------------------------------------------------
// Mapping (deterministic: never by name alone, never creates anything)
// ---------------------------------------------------------------------------

export function customerKeys(sale: StoreSale): { idKey: string | null; emailKey: string | null; display: string } {
  const email = normalizeEmail(sale.customer.email) || null;
  return {
    idKey: sale.customer.id ? sale.customer.id : null,
    emailKey: email ? `email:${email}` : null,
    display: [sale.customer.name, email].filter(Boolean).join(" · ") || "Guest without e-mail",
  };
}

async function customersInCompany(supabase: SupabaseClient, companyId: string, ids: string[]): Promise<Array<{ id: string; customer_name: string | null }>> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from("vyron_customers").select("id, customer_name").eq("company_id", companyId).in("id", ids);
  if (error) raiseDb(error, "Customer lookup failed");
  return (data || []) as Array<{ id: string; customer_name: string | null }>;
}

type CustomerResolution = { customer: { id: string; customer_name: string | null } | null; rule: string | null; issue: SaleIssue | null };

/**
 * Customer ladder: the store's customer id mapped by a person · the order
 * e-mail mapped by a person · an e-mail that belongs to exactly one VOLORA
 * customer · otherwise the store's own online-sales customer. Never by name,
 * never a new customer per shopper; the shopper's name and e-mail are kept on
 * the invoice.
 */
export async function resolveSaleCustomer(supabase: SupabaseClient, connection: StoreConnection, sale: StoreSale): Promise<CustomerResolution> {
  const companyId = connection.company_id;
  const system = catalogSystem(connection);
  const keys = customerKeys(sale);
  for (const [rule, key] of [
    ["store_customer", keys.idKey],
    ["store_email", keys.emailKey],
  ] as const) {
    if (!key) continue;
    const found = await customersInCompany(supabase, companyId, await linkedEntityIds(supabase, companyId, system, "customer", key, ["customer"]));
    if (found.length === 1) return { customer: found[0], rule, issue: null };
  }
  if (keys.emailKey) {
    const match = await matchCustomer(supabase, companyId, { senderEmail: sale.customer.email });
    if (match.status === "MATCHED" && match.customer) return { customer: { id: match.customer.id, customer_name: match.customer.customer_name ?? null }, rule: "email", issue: null };
  }
  if (connection.default_customer_id) {
    const found = await customersInCompany(supabase, companyId, [connection.default_customer_id]);
    if (found.length === 1) return { customer: found[0], rule: "store_account", issue: null };
  }
  return {
    customer: null,
    rule: null,
    issue: { code: "STORE_CUSTOMER_MISSING", message: "The store's online-sales customer no longer exists. Choose a customer for this store's sales, then retry.", key: keys.idKey ?? keys.emailKey },
  };
}

type ProductResolution = { products: Map<string, { productId: string; costPerUnit: number }>; issues: SaleIssue[] };

/** Product ladder: the store's product/variant mapped by a person · exact SKU · approved aliases. Never by name alone. */
export async function resolveSaleProducts(supabase: SupabaseClient, connection: StoreConnection, sale: StoreSale, customerId: string | null): Promise<ProductResolution> {
  const companyId = connection.company_id;
  const lines = sale.lines.filter((line) => line.quantity > 0);
  const matcher = await createProductMatcher(supabase, companyId, {
    customerId,
    rawSkus: lines.map((line) => line.sku),
    catalogSystem: catalogSystem(connection),
    nameMatching: "off",
  });
  const products = new Map<string, { productId: string; costPerUnit: number }>();
  const issues: SaleIssue[] = [];
  for (const line of lines) {
    const match = await matcher.match({ rawSku: line.sku, rawDescription: line.name, externalProductId: line.externalKey });
    if (match.status === "MATCHED" && match.product) {
      // The cost basis an invoice typed into VOLORA uses for this customer and product.
      const price = await resolveCustomerProductPrice(supabase, companyId, { customerId, productId: match.product.id });
      products.set(line.lineId, { productId: match.product.id, costPerUnit: Number(price.costPerUnit || match.product.total_cost || 0) });
      continue;
    }
    issues.push({
      code: match.status === "AMBIGUOUS" ? "PRODUCT_AMBIGUOUS" : "PRODUCT_UNMAPPED",
      message:
        match.status === "AMBIGUOUS"
          ? `${line.name}${line.sku ? ` (SKU ${line.sku})` : ""}: ${match.reason}`
          : `Product mapping required: ${line.name}${line.sku ? ` (SKU ${line.sku})` : " (no SKU)"}. Map the ${CHANNEL_LABEL[connection.channel]} product to a VOLORA product.`,
      key: line.externalKey,
      lineName: line.name,
      detail: { source: CHANNEL_LABEL[connection.channel], externalProductId: line.externalProductLabel, sku: line.sku, productName: line.name, order: sale.orderNumber },
    });
  }
  return { products, issues };
}

// ---------------------------------------------------------------------------
// Processing one order
// ---------------------------------------------------------------------------

function backoffAt(attempts: number): string | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const seconds = BACKOFF_SECONDS[Math.min(attempts, BACKOFF_SECONDS.length) - 1] ?? BACKOFF_SECONDS[0];
  return new Date(storeRuntime.now() + seconds * 1000).toISOString();
}

/** Take the processing lease (compare-and-set on version). Null: someone else holds it. */
async function acquireLease(supabase: SupabaseClient, row: StoreOrderRow): Promise<StoreOrderRow | null> {
  if (row.locked_until && Date.parse(row.locked_until) > storeRuntime.now()) return null;
  const { data, error } = await supabase
    .from(T_ORDERS)
    .update({ locked_until: new Date(storeRuntime.now() + LEASE_MS).toISOString(), version: row.version + 1, updated_at: nowIso() })
    .eq("company_id", row.company_id)
    .eq("id", row.id)
    .eq("version", row.version)
    .select("*");
  if (error) raiseDb(error, "Order lease failed");
  const rows = (data || []) as StoreOrderRow[];
  return rows.length === 1 ? rows[0] : null;
}

/** Write while still holding the lease. */
async function persist(supabase: SupabaseClient, row: StoreOrderRow, patch: Partial<StoreOrderRow>): Promise<StoreOrderRow> {
  const { data, error } = await supabase.from(T_ORDERS).update({ ...patch, updated_at: nowIso() }).eq("company_id", row.company_id).eq("id", row.id).select("*").single();
  if (error) raiseDb(error, "Order update failed");
  return data as StoreOrderRow;
}

/**
 * Write the outcome and release the lease. If the store told us about the
 * order again while this run was busy (a refund arriving mid-import), the
 * order stays due so the newer event is not lost.
 */
async function finish(supabase: SupabaseClient, row: StoreOrderRow, patch: Partial<StoreOrderRow>): Promise<StoreOrderRow> {
  const leaseStart = row.locked_until ? Date.parse(row.locked_until) - LEASE_MS : null;
  const { data: current, error: readError } = await supabase.from(T_ORDERS).select("last_event_at").eq("company_id", row.company_id).eq("id", row.id).maybeSingle();
  if (readError) raiseDb(readError, "Order lookup failed");
  const lastEvent = (current as { last_event_at?: string | null } | null)?.last_event_at;
  const dueAgain = leaseStart !== null && lastEvent ? Date.parse(lastEvent) > leaseStart : false;
  const next = dueAgain ? nowIso() : patch.next_attempt_at;
  return persist(supabase, row, { ...patch, next_attempt_at: next === undefined ? row.next_attempt_at : next, locked_until: null });
}

function saleFacts(sale: StoreSale): Partial<StoreOrderRow> {
  return {
    order_number: sale.orderNumber,
    order_created_at: sale.createdAt,
    financial_status: sale.financialStatus || null,
    cancelled_at: sale.cancelledAt,
    currency: sale.currency,
    total_price: sale.totals.total,
    customer_display: customerKeys(sale).display.slice(0, 300),
  };
}

const issuesPatch = (issues: SaleIssue[]) => ({ issues, issue_codes: [...new Set(issues.map((i) => i.code))] });

export type ProcessOutcome = { row: StoreOrderRow; outcome: "imported" | "already_imported" | "updated" | "attention" | "waiting" | "skipped" | "failed" | "busy" | "disabled" };

/**
 * Bring one order's VOLORA record in line with the store. Safe to run any
 * number of times: the sale and each refund are written at most once.
 */
export async function processOrderRow(supabase: SupabaseClient, connection: StoreConnection, input: StoreOrderRow, actor = SYNC_ACTOR): Promise<ProcessOutcome> {
  if (connection.status !== "ACTIVE") return { row: input, outcome: "disabled" };
  const row = await acquireLease(supabase, input);
  if (!row) return { row: input, outcome: "busy" };

  let sale: StoreSale | null;
  try {
    sale = await connectorFor(connection.channel).fetchSale(ref(connection), row.external_order_id);
  } catch (error) {
    const retryable = !(error instanceof StoreApiError) || error.retryable;
    const attempts = row.attempts + 1;
    await recordFailure(supabase, connection, errorMessage(error));
    const updated = await finish(supabase, row, {
      // An order already recorded stays recorded; only the refresh is retried.
      status: row.invoice_id ? row.status : "FAILED",
      attempts,
      last_error: errorMessage(error).slice(0, 1000),
      next_attempt_at: retryable ? backoffAt(attempts) : null,
    });
    await writeEvent(supabase, {
      companyId: row.company_id,
      connectionId: connection.id,
      orderRowId: row.id,
      type: "FETCH_FAILED",
      actor,
      detail: errorMessage(error).slice(0, 500),
      metadata: { attempts, retryable, nextAttemptAt: updated.next_attempt_at },
    });
    return { row: updated, outcome: "failed" };
  }

  if (!sale) {
    const updated = await finish(supabase, row, {
      status: row.invoice_id ? row.status : "FAILED",
      last_error:
        connection.channel === "SHOPIFY"
          ? "Shopify has no such order (deleted, or older than 60 days without read_all_orders)."
          : "WooCommerce has no such order (deleted or trashed).",
      next_attempt_at: null,
    });
    await writeEvent(supabase, { companyId: row.company_id, connectionId: connection.id, orderRowId: row.id, type: "ORDER_NOT_FOUND", actor });
    return { row: updated, outcome: "failed" };
  }

  try {
    const result = row.invoice_id ? await refreshImported(supabase, connection, row, sale, actor) : await importSale(supabase, connection, row, sale, actor);
    await recordSuccess(supabase, connection);
    return result;
  } catch (error) {
    if (error instanceof StoreSyncError && error.code === "NOT_ENABLED") throw error;
    const attempts = row.attempts + 1;
    await recordFailure(supabase, connection, errorMessage(error));
    const updated = await finish(supabase, row, {
      ...saleFacts(sale),
      status: row.invoice_id ? row.status : "FAILED",
      attempts,
      last_error: errorMessage(error).slice(0, 1000),
      next_attempt_at: backoffAt(attempts),
    });
    await writeEvent(supabase, { companyId: row.company_id, connectionId: connection.id, orderRowId: row.id, type: "PROCESS_FAILED", actor, detail: errorMessage(error).slice(0, 500), metadata: { attempts } });
    return { row: updated, outcome: "failed" };
  }
}

async function importSale(supabase: SupabaseClient, connection: StoreConnection, row: StoreOrderRow, sale: StoreSale, actor: string): Promise<ProcessOutcome> {
  const companyId = connection.company_id;
  const facts = saleFacts(sale);
  const stop = async (status: OrderSyncStatus, issues: SaleIssue[], outcome: ProcessOutcome["outcome"], detail: string) => {
    const updated = await finish(supabase, row, { ...facts, status, ...issuesPatch(issues), last_error: null, next_attempt_at: null, attempts: 0 });
    await writeEvent(supabase, {
      companyId,
      connectionId: connection.id,
      orderRowId: row.id,
      type: status === "NEEDS_ATTENTION" ? "NEEDS_ATTENTION" : status,
      actor,
      detail,
      metadata: { codes: issues.map((i) => i.code), financialStatus: sale.financialStatus },
    });
    return { row: updated, outcome };
  };

  if (sale.test) return stop("SKIPPED", [], "skipped", "A test order is not a sale.");
  if (sale.cancelledAt) return stop("SKIPPED", [], "skipped", `Cancelled in the store before it was recorded (${sale.cancelReason || "no reason given"}).`);
  if (!SALE_STATUSES[connection.channel].includes(sale.financialStatus)) {
    if (WAITING_STATUSES.includes(sale.financialStatus)) {
      return stop("WAITING", [], "waiting", `Status ${sale.financialStatus}: recorded as a sale once the store reports it paid.`);
    }
    return stop("SKIPPED", [], "skipped", `Status ${sale.financialStatus || "unknown"} is not a completed sale.`);
  }
  if (sale.currency && sale.currency !== connection.expected_currency) {
    return stop(
      "NEEDS_ATTENTION",
      [{ code: "CURRENCY_MISMATCH", message: `The order is in ${sale.currency}; VOLORA records ${connection.expected_currency}. Nothing was recorded.` }],
      "attention",
      "Currency mismatch."
    );
  }
  if (!sale.lines.some((line) => line.quantity > 0)) return stop("SKIPPED", [], "skipped", "Every item was removed before payment; there is no sale.");

  const customer = await resolveSaleCustomer(supabase, connection, sale);
  const productResult = await resolveSaleProducts(supabase, connection, sale, customer.customer?.id ?? null);
  const issues: SaleIssue[] = [...(customer.issue ? [customer.issue] : []), ...productResult.issues];
  if (issues.length) return stop("NEEDS_ATTENTION", issues, "attention", issues.map((i) => i.message).join(" · ").slice(0, 1000));

  const workspaceRate = await resolveDefaultVatRate(supabase, companyId);
  const plan = planSaleInvoice(sale, productResult.products, { workspaceRate });
  if (plan.issues.length) return stop("NEEDS_ATTENTION", plan.issues, "attention", plan.issues.map((i) => i.message).join(" · ").slice(0, 1000));

  const invoice = await writeSaleInvoice(supabase, connection, sale, customer.customer!, plan.lines);
  const lineMap: LineMapEntry[] = sale.lines.filter((line) => productResult.products.has(line.lineId)).map((line) => ({ lineId: line.lineId, ...productResult.products.get(line.lineId)! }));
  // Linked straight away (lease still held): a failure after this point retries refunds, never the sale.
  const imported = await persist(supabase, row, {
    ...facts,
    status: "IMPORTED",
    ...issuesPatch([]),
    customer_id: customer.customer!.id,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    line_map: lineMap,
    sale_fingerprint: saleFingerprint(sale),
    attempts: 0,
    last_error: null,
    imported_at: nowIso(),
  });
  await writeEvent(supabase, {
    companyId,
    connectionId: connection.id,
    orderRowId: row.id,
    type: "IMPORTED",
    actor,
    detail: `${CHANNEL_LABEL[connection.channel]} ${sale.orderNumber} recorded as invoice ${invoice.invoice_number}.`,
    metadata: { invoiceId: invoice.id, customerRule: customer.rule, salesValue: invoice.sales_value, taxTotal: invoice.tax_total },
  });

  const refunds = sale.refunds.length ? await applyRefunds(supabase, connection, imported, sale, actor) : { created: 0, issues: [] };
  const updated = await finish(supabase, imported, { status: refunds.issues.length ? "NEEDS_ATTENTION" : "IMPORTED", ...issuesPatch(refunds.issues), next_attempt_at: null });
  return { row: updated, outcome: "imported" };
}

/** Who bought it, as the store states it — kept on every invoice booked to the store's online-sales customer. */
function shopperNote(sale: StoreSale): string | null {
  const who = [sale.customer.name, sale.customer.email].filter(Boolean).join(" · ");
  return who ? `Customer in ${CHANNEL_LABEL[sale.channel]}: ${who}` : null;
}

/**
 * Write the sale through the invoice pipeline. The invoice number is derived
 * from the store's order id and is unique in the database, so a second writer
 * (a crash-retry, a concurrent delivery) finds the first writer's invoice.
 */
async function writeSaleInvoice(supabase: SupabaseClient, connection: StoreConnection, sale: StoreSale, customer: { id: string; customer_name: string | null }, lines: CustomerInvoiceLineInput[]): Promise<CustomerInvoiceRow> {
  const companyId = connection.company_id;
  const invoiceNumber = saleInvoiceNumber(connection, sale.orderId);
  const reference = orderReference(connection, sale.orderId);
  let invoice: CustomerInvoiceRow;
  try {
    invoice = await createCustomerInvoice(supabase, companyId, {
      customerId: customer.id,
      customerName: customer.customer_name || `${CHANNEL_LABEL[connection.channel]} customer`,
      invoiceNumber,
      invoiceDate: sale.saleDate,
      notes: [`${CHANNEL_LABEL[connection.channel]} order ${sale.orderNumber} (id ${sale.orderId}) · ${connection.store_url.replace(/^https:\/\//, "")}`, shopperNote(sale)].filter(Boolean).join("\n"),
      pricesIncludeTax: sale.taxesIncluded,
      lines,
      useSuppliedLineValues: true,
      source: { channel: connection.channel, reference },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    invoice = await adoptExistingInvoice(supabase, companyId, invoiceNumber, reference);
  }
  return issueInvoice(supabase, connection, invoice);
}

async function adoptExistingInvoice(supabase: SupabaseClient, companyId: string, invoiceNumber: string, reference: string): Promise<CustomerInvoiceRow> {
  const { data, error } = await supabase.from("vyron_customer_invoices").select("*").eq("company_id", companyId).eq("invoice_number", invoiceNumber).maybeSingle();
  if (error) raiseDb(error, "Invoice lookup failed");
  const existing = data as CustomerInvoiceRow | null;
  if (!existing || existing.source_reference !== reference) {
    throw new Error(`Invoice number ${invoiceNumber} is already used by a document that did not come from this store record.`);
  }
  const { data: lines, error: lineError } = await supabase.from("vyron_customer_invoice_lines").select("id").eq("invoice_id", existing.id);
  if (lineError) raiseDb(lineError, "Invoice line lookup failed");
  if (!lines || !lines.length) throw new Error(`Invoice ${invoiceNumber} exists without lines from an interrupted attempt; it needs manual review.`);
  return existing;
}

/**
 * Issue the document: Draft → Posted, without a stock movement and without the
 * Xero queue — exactly as VOLORA's existing invoice import records sales it did
 * not capture itself. Posted invoices count in every sales, revenue, VAT and GP
 * report. Idempotent.
 */
async function issueInvoice(supabase: SupabaseClient, connection: StoreConnection, invoice: CustomerInvoiceRow): Promise<CustomerInvoiceRow> {
  if (invoice.status !== "Draft") return invoice;
  const { data, error } = await supabase
    .from("vyron_customer_invoices")
    .update({ status: "Posted", posted_at: nowIso(), updated_at: nowIso() })
    .eq("company_id", connection.company_id)
    .eq("id", invoice.id)
    .eq("status", "Draft")
    .select("*");
  if (error) raiseDb(error, "Issue invoice failed");
  return ((data || []) as CustomerInvoiceRow[])[0] || invoice;
}

// ---------------------------------------------------------------------------
// After import: refunds, edits, cancellation
// ---------------------------------------------------------------------------

async function refreshImported(supabase: SupabaseClient, connection: StoreConnection, row: StoreOrderRow, sale: StoreSale, actor: string): Promise<ProcessOutcome> {
  const { created, issues: refundIssues } = await applyRefunds(supabase, connection, row, sale, actor);
  const issues: SaleIssue[] = [...refundIssues];
  if (row.sale_fingerprint && saleFingerprint(sale) !== row.sale_fingerprint) {
    issues.push({
      code: "ORDER_CHANGED_AFTER_IMPORT",
      message: `The order was edited in the store after it was recorded as ${row.invoice_number}. The recorded invoice was not changed; review it against the store.`,
    });
  }
  if (sale.cancelledAt) {
    const unrefunded = (sale.totals.total ?? 0) - (sale.totals.refunded ?? 0);
    if (unrefunded > 0.01) {
      issues.push({
        code: "CANCELLED_NOT_REFUNDED",
        message: `Cancelled in the store after it was recorded, with ${unrefunded.toFixed(2)} not refunded. Decide whether ${row.invoice_number} should be credited.`,
      });
    }
  }
  const status: OrderSyncStatus = issues.length ? "NEEDS_ATTENTION" : "IMPORTED";
  const updated = await finish(supabase, row, { ...saleFacts(sale), status, ...issuesPatch(issues), attempts: 0, last_error: null, next_attempt_at: null });
  if (!created && !issues.length) {
    await writeEvent(supabase, { companyId: row.company_id, connectionId: connection.id, orderRowId: row.id, type: "ALREADY_IMPORTED", actor, detail: `No change since ${row.invoice_number} was recorded.` });
    return { row: updated, outcome: "already_imported" };
  }
  if (issues.length) {
    await writeEvent(supabase, { companyId: row.company_id, connectionId: connection.id, orderRowId: row.id, type: "NEEDS_ATTENTION", actor, detail: issues.map((i) => i.message).join(" · ").slice(0, 1000), metadata: { codes: issues.map((i) => i.code) } });
    return { row: updated, outcome: "attention" };
  }
  return { row: updated, outcome: "updated" };
}

/** Credit every refund not yet credited. Each refund becomes at most one credit note. */
async function applyRefunds(supabase: SupabaseClient, connection: StoreConnection, row: StoreOrderRow, sale: StoreSale, actor: string): Promise<{ created: number; issues: SaleIssue[] }> {
  const companyId = connection.company_id;
  const { data, error } = await supabase.from(T_REFUNDS).select("external_refund_id, credit_invoice_id").eq("company_id", companyId).eq("store_order_row_id", row.id);
  if (error) raiseDb(error, "Refund lookup failed");
  const done = new Set(((data || []) as Array<{ external_refund_id: string; credit_invoice_id: string | null }>).filter((r) => r.credit_invoice_id).map((r) => r.external_refund_id));
  const originalLines = new Map((row.line_map || []).map((entry) => [entry.lineId, { productId: entry.productId, costPerUnit: Number(entry.costPerUnit || 0) }]));
  const issues: SaleIssue[] = [];
  let created = 0;
  let workspaceRate: number | null = null;

  for (const refund of sale.refunds) {
    if (done.has(refund.refundId)) continue;
    if (refund.total === 0 && !refund.lines.length && !refund.shipping.some((s) => s.subtotal !== 0)) continue; // nothing was credited
    workspaceRate ??= await resolveDefaultVatRate(supabase, companyId);
    const plan = planRefundCredit(sale, refund, originalLines, { workspaceRate });
    if (plan.issues.length) {
      issues.push(...plan.issues);
      continue;
    }
    if (!plan.lines.length) continue;
    const credit = await writeCreditNote(supabase, connection, row, sale, refund, plan.lines);
    const { error: insertError } = await supabase.from(T_REFUNDS).insert({
      company_id: companyId,
      connection_id: connection.id,
      store_order_row_id: row.id,
      external_refund_id: refund.refundId,
      refunded_at: refund.createdAt,
      amount: refund.total,
      credit_invoice_id: credit.id,
      credit_invoice_number: credit.invoice_number,
      created_at: nowIso(),
    });
    if (insertError && !isUniqueViolation(insertError)) raiseDb(insertError, "Record refund failed");
    created++;
    await writeEvent(supabase, {
      companyId,
      connectionId: connection.id,
      orderRowId: row.id,
      type: "REFUND_CREDITED",
      actor,
      detail: `${CHANNEL_LABEL[connection.channel]} refund ${refund.refundId} (${refund.total.toFixed(2)}) credited as ${credit.invoice_number} against ${row.invoice_number}.`,
      metadata: { creditInvoiceId: credit.id },
    });
  }
  return { created, issues };
}

async function writeCreditNote(supabase: SupabaseClient, connection: StoreConnection, row: StoreOrderRow, sale: StoreSale, refund: SaleRefund, lines: CustomerInvoiceLineInput[]): Promise<CustomerInvoiceRow> {
  const companyId = connection.company_id;
  const invoiceNumber = creditInvoiceNumber(connection, refund.refundId);
  const reference = refundReference(connection, refund.refundId);
  const customer = await customersInCompany(supabase, companyId, row.customer_id ? [row.customer_id] : []);
  let credit: CustomerInvoiceRow;
  try {
    credit = await createCustomerInvoice(supabase, companyId, {
      customerId: row.customer_id,
      customerName: customer[0]?.customer_name || `${CHANNEL_LABEL[connection.channel]} customer`,
      invoiceNumber,
      invoiceDate: refund.refundDate,
      notes: [
        `Credit note for ${CHANNEL_LABEL[connection.channel]} refund ${refund.refundId} on order ${sale.orderNumber}, crediting ${row.invoice_number}.`,
        refund.note ? `Store note: ${refund.note}` : null,
        shopperNote(sale),
      ]
        .filter(Boolean)
        .join("\n"),
      pricesIncludeTax: sale.taxesIncluded,
      lines,
      useSuppliedLineValues: true,
      source: { channel: connection.channel, reference },
      creditedInvoiceId: row.invoice_id,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    credit = await adoptExistingInvoice(supabase, companyId, invoiceNumber, reference);
  }
  return issueInvoice(supabase, connection, credit);
}

// ---------------------------------------------------------------------------
// Queue: due orders
// ---------------------------------------------------------------------------

export type RunSummary = { processed: number; outcomes: Record<string, number>; remaining: boolean };

/** Process orders that are due, oldest first, until the limit or the deadline. */
export async function processDueOrders(supabase: SupabaseClient, connection: StoreConnection, options: { limit?: number; deadline?: number; orderRowIds?: string[] } = {}): Promise<RunSummary> {
  const summary: RunSummary = { processed: 0, outcomes: {}, remaining: false };
  if (connection.status !== "ACTIVE") return summary;
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 200);
  let query = supabase.from(T_ORDERS).select("*").eq("company_id", connection.company_id).eq("connection_id", connection.id).lte("next_attempt_at", nowIso());
  if (options.orderRowIds?.length) query = query.in("id", options.orderRowIds);
  const { data, error } = await query.order("next_attempt_at", { ascending: true }).limit(limit + 1);
  if (error) raiseDb(error, "Load due orders failed");
  const due = ((data || []) as StoreOrderRow[]).sort((a, b) => String(a.next_attempt_at).localeCompare(String(b.next_attempt_at)));
  summary.remaining = due.length > limit;
  for (const row of due.slice(0, limit)) {
    if (options.deadline && storeRuntime.now() > options.deadline) {
      summary.remaining = true;
      break;
    }
    const { outcome } = await processOrderRow(supabase, connection, row);
    summary.processed++;
    summary.outcomes[outcome] = (summary.outcomes[outcome] || 0) + 1;
  }
  return summary;
}

/** A person asks for one order to be tried again now (after fixing a mapping, stock or a setting). */
export async function retryOrder(supabase: SupabaseClient, companyId: string, orderRowId: string, actor: string): Promise<ProcessOutcome> {
  const { data, error } = await supabase.from(T_ORDERS).select("*").eq("company_id", companyId).eq("id", orderRowId).maybeSingle();
  if (error) raiseDb(error, "Order lookup failed");
  if (!data) throw new StoreSyncError("NOT_FOUND", "Store order not found.");
  const row = data as StoreOrderRow;
  const connection = await loadConnection(supabase, companyId, row.connection_id);
  if (connection.status !== "ACTIVE") throw new StoreSyncError("CONFLICT", "The store's sync is not active.");
  await writeEvent(supabase, { companyId, connectionId: connection.id, orderRowId: row.id, type: "RETRY_REQUESTED", actor });
  return processOrderRow(supabase, connection, { ...row, attempts: 0 }, actor);
}

/**
 * Sync Now / scheduled catch-up: ask the store which orders changed since the
 * last catch-up (with overlap), mark them due, and process what is due. This is
 * what recovers a webhook the store never delivered — WooCommerce does not
 * retry, and disables a webhook after five failures.
 */
export async function syncNow(
  supabase: SupabaseClient,
  connection: StoreConnection,
  actor: string,
  options: { deadline?: number } = {}
): Promise<{ discovered: number; processed: RunSummary; complete: boolean }> {
  if (connection.status !== "ACTIVE") throw new StoreSyncError("CONFLICT", "The store's sync is not active.");
  const startedAt = nowIso();
  const since = connection.last_reconciled_at
    ? new Date(Date.parse(connection.last_reconciled_at) - RECONCILE_OVERLAP_MS).toISOString()
    : new Date(storeRuntime.now() - RECONCILE_LOOKBACK_MS).toISOString();
  const connector = connectorFor(connection.channel);
  let cursor: string | null = null;
  let discovered = 0;
  let complete = false;
  try {
    for (let page = 0; page < RECONCILE_MAX_PAGES; page++) {
      const result = await connector.listOrderIds(ref(connection), { updatedSince: since, cursor, pageSize: PAGE_SIZE });
      for (const id of result.ids) {
        await markOrderDue(supabase, connection, id, "catch-up");
        discovered++;
      }
      cursor = result.nextCursor;
      if (!cursor) {
        complete = true;
        break;
      }
      if (options.deadline && storeRuntime.now() > options.deadline) break;
    }
  } catch (error) {
    await recordFailure(supabase, connection, errorMessage(error));
    await writeEvent(supabase, { companyId: connection.company_id, connectionId: connection.id, type: "SYNC_FAILED", actor, detail: errorMessage(error).slice(0, 500) });
    throw error;
  }
  const processed = await processDueOrders(supabase, connection, { limit: 50, deadline: options.deadline });
  // Only a complete pass moves the catch-up point; an interrupted one repeats from the same place.
  await supabase
    .from(T_CONNECTIONS)
    .update({ last_sync_at: nowIso(), last_success_at: nowIso(), ...(complete ? { last_reconciled_at: startedAt } : {}) })
    .eq("company_id", connection.company_id)
    .eq("id", connection.id);
  await writeEvent(supabase, {
    companyId: connection.company_id,
    connectionId: connection.id,
    type: "SYNC_RUN",
    actor,
    detail: `Checked orders changed since ${since}: ${discovered} found, ${processed.processed} processed${complete ? "" : " (more remain; continues next run)"}.`,
    metadata: { since, discovered, outcomes: processed.outcomes, complete },
  });
  return { discovered, processed, complete };
}

// ---------------------------------------------------------------------------
// Mappings (a person's decision, then the affected orders are retried)
// ---------------------------------------------------------------------------

export type MappingInput = { connectionId: string; kind: "product" | "customer"; key: string; targetId: string };

/**
 * Record that a store product (variant/variation/product key) or customer (id
 * or email key) is a given VOLORA record, in the provenance table the Order
 * Engine's ladders read, then retry every order of this store waiting on it.
 */
export async function saveMapping(supabase: SupabaseClient, companyId: string, input: MappingInput, actor: string): Promise<{ retried: RunSummary }> {
  const connection = await loadConnection(supabase, companyId, input.connectionId);
  const key = String(input.key || "").trim();
  if (!key || key.length > 300) throw new StoreSyncError("INVALID_INPUT", "A mapping key is required.");
  if (input.kind === "product") {
    if (!/^(variant|variation|product):\d+$|^title:.+$/.test(key)) throw new StoreSyncError("INVALID_INPUT", "Unknown store product key.");
    const { data, error } = await supabase.from("vyron_cost_products").select("id").eq("company_id", companyId).eq("id", input.targetId).maybeSingle();
    if (error) raiseDb(error, "Product lookup failed");
    if (!data) throw new StoreSyncError("INVALID_INPUT", "That product does not exist in this company.");
  } else if (input.kind === "customer") {
    if (!/^\d+$|^email:.+@.+$/.test(key)) throw new StoreSyncError("INVALID_INPUT", "Unknown store customer key.");
    await assertCustomerInCompany(supabase, companyId, input.targetId);
  } else {
    throw new StoreSyncError("INVALID_INPUT", 'kind must be "product" or "customer".');
  }

  const now = nowIso();
  const { error } = await supabase.from("vyron_import_source_links").upsert(
    { company_id: companyId, source_system: catalogSystem(connection), source_entity: input.kind, source_key: key, entity_type: input.kind, entity_id: input.targetId, updated_at: now },
    { onConflict: "company_id,source_system,source_entity,source_key" }
  );
  if (error) raiseDb(error, "Save mapping failed");
  await writeEvent(supabase, { companyId, connectionId: connection.id, type: "MAPPING_SAVED", actor, detail: `${input.kind} ${key} → ${input.targetId}`, metadata: { kind: input.kind, key, targetId: input.targetId } });

  const { data: waiting, error: waitingError } = await supabase
    .from(T_ORDERS)
    .select("id, issues")
    .eq("company_id", companyId)
    .eq("connection_id", connection.id)
    .eq("status", "NEEDS_ATTENTION")
    .limit(500);
  if (waitingError) raiseDb(waitingError, "Load waiting orders failed");
  const affected = ((waiting || []) as Array<{ id: string; issues: SaleIssue[] }>).filter((row) => (row.issues || []).some((issue) => issue.key === key)).map((row) => row.id);
  if (affected.length) {
    const { error: dueError } = await supabase.from(T_ORDERS).update({ next_attempt_at: now, updated_at: now }).eq("company_id", companyId).in("id", affected);
    if (dueError) raiseDb(dueError, "Requeue orders failed");
  }
  const retried = affected.length ? await processDueOrders(supabase, connection, { orderRowIds: affected.slice(0, 20), limit: 20 }) : { processed: 0, outcomes: {}, remaining: false };
  return { retried };
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

export type SyncOverview = {
  counts: { discovered: number; imported: number; alreadyImported: number; needsAttention: number; waiting: number; failed: number; skipped: number; pending: number };
  rows: Array<Omit<StoreOrderRow, "line_map" | "sale_fingerprint" | "locked_until" | "version">>;
  backfill: StoreBackfillRow | null;
};

export async function getSyncOverview(supabase: SupabaseClient, companyId: string, connectionId: string, options: { status?: string | null; limit?: number } = {}): Promise<SyncOverview> {
  const connection = await loadConnection(supabase, companyId, connectionId);
  const base: Array<[string, string]> = [
    ["company_id", companyId],
    ["connection_id", connection.id],
  ];
  const [discovered, imported, alreadyImported, duplicates, needsAttention, waiting, failed, skipped, pending] = await Promise.all([
    countWhere(supabase, T_ORDERS, base),
    countWhere(supabase, T_ORDERS, [...base, ["status", "IMPORTED"]]),
    countWhere(supabase, T_EVENTS, [...base, ["event_type", "ALREADY_IMPORTED"]]),
    countWhere(supabase, T_EVENTS, [...base, ["event_type", "DUPLICATE_DELIVERY"]]),
    countWhere(supabase, T_ORDERS, [...base, ["status", "NEEDS_ATTENTION"]]),
    countWhere(supabase, T_ORDERS, [...base, ["status", "WAITING"]]),
    countWhere(supabase, T_ORDERS, [...base, ["status", "FAILED"]]),
    countWhere(supabase, T_ORDERS, [...base, ["status", "SKIPPED"]]),
    countWhere(supabase, T_ORDERS, [...base, ["status", "PENDING"]]),
  ]);
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
  let query = supabase
    .from(T_ORDERS)
    .select(
      "id, company_id, connection_id, channel, external_order_id, order_number, order_created_at, financial_status, cancelled_at, currency, total_price, customer_display, status, issues, issue_codes, customer_id, invoice_id, invoice_number, stock_moved, attempts, next_attempt_at, last_error, last_event_at, imported_at, created_at, updated_at"
    )
    .eq("company_id", companyId)
    .eq("connection_id", connection.id);
  if (options.status && ["PENDING", "WAITING", "IMPORTED", "NEEDS_ATTENTION", "FAILED", "SKIPPED"].includes(options.status)) query = query.eq("status", options.status);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(limit);
  if (error) raiseDb(error, "List orders failed");
  return {
    counts: { discovered, imported, alreadyImported: alreadyImported + duplicates, needsAttention, waiting, failed, skipped, pending },
    rows: ((data || []) as SyncOverview["rows"]).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))),
    backfill: await latestBackfill(supabase, companyId, connection.id),
  };
}

export type SyncEventRow = { id: string; store_order_row_id: string | null; event_type: string; actor: string; detail: string | null; created_at: string };

/** The sync log: what happened, newest first. */
export async function listSyncEvents(supabase: SupabaseClient, companyId: string, connectionId: string, limit = 200): Promise<SyncEventRow[]> {
  const connection = await loadConnection(supabase, companyId, connectionId);
  const { data, error } = await supabase
    .from(T_EVENTS)
    .select("id, store_order_row_id, event_type, actor, detail, created_at")
    .eq("company_id", companyId)
    .eq("connection_id", connection.id)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) raiseDb(error, "Load sync log failed");
  return ((data || []) as SyncEventRow[]).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

// ---------------------------------------------------------------------------
// Historical import (paginated, resumable, idempotent, audited, retryable)
// ---------------------------------------------------------------------------

async function latestBackfill(supabase: SupabaseClient, companyId: string, connectionId: string): Promise<StoreBackfillRow | null> {
  const { data, error } = await supabase.from(T_BACKFILLS).select("*").eq("company_id", companyId).eq("connection_id", connectionId).order("started_at", { ascending: false }).limit(20);
  if (error) raiseDb(error, "Import lookup failed");
  return ((data || []) as StoreBackfillRow[]).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0] || null;
}

export async function startBackfill(supabase: SupabaseClient, companyId: string, input: { connectionId: string; from: unknown; to?: unknown }, actor: string): Promise<StoreBackfillRow> {
  const connection = await loadConnection(supabase, companyId, input.connectionId);
  const from = String(input.from ?? "").trim();
  const to = String(input.to ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new StoreSyncError("INVALID_INPUT", "Choose the first order date to import (YYYY-MM-DD).");
  if (to && (!/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from)) throw new StoreSyncError("INVALID_INPUT", "The last date must be on or after the first.");
  const now = nowIso();
  const { data, error } = await supabase
    .from(T_BACKFILLS)
    .insert({
      company_id: companyId,
      connection_id: connection.id,
      status: "RUNNING",
      created_from: from,
      created_to: to || null,
      cursor: null,
      pages: 0,
      orders_seen: 0,
      attempts: 0,
      last_error: null,
      started_by: actor,
      started_at: now,
      completed_at: null,
      updated_at: now,
      version: 1,
    })
    .select("*")
    .single();
  if (error) {
    if (isUniqueViolation(error)) throw new StoreSyncError("CONFLICT", "A historical import is already running for this store.");
    raiseDb(error, "Start import failed");
  }
  await writeEvent(supabase, { companyId, connectionId: connection.id, type: "BACKFILL_STARTED", actor, detail: `Historical import ${from} → ${to || "today"}.` });
  return data as StoreBackfillRow;
}

export async function setBackfillState(supabase: SupabaseClient, companyId: string, backfillId: string, state: "PAUSED" | "RUNNING", actor: string): Promise<StoreBackfillRow> {
  const { data: current, error } = await supabase.from(T_BACKFILLS).select("*").eq("company_id", companyId).eq("id", backfillId).maybeSingle();
  if (error) raiseDb(error, "Import lookup failed");
  if (!current) throw new StoreSyncError("NOT_FOUND", "Historical import not found.");
  const row = current as StoreBackfillRow;
  if (row.status === "COMPLETED") throw new StoreSyncError("CONFLICT", "This historical import is complete.");
  const { data, error: updateError } = await supabase
    .from(T_BACKFILLS)
    .update({ status: state, attempts: state === "RUNNING" ? 0 : row.attempts, version: row.version + 1, updated_at: nowIso() })
    .eq("company_id", companyId)
    .eq("id", row.id)
    .eq("version", row.version)
    .select("*");
  if (updateError) {
    if (isUniqueViolation(updateError)) throw new StoreSyncError("CONFLICT", "Another historical import is already running for this store.");
    raiseDb(updateError, "Update import failed");
  }
  const rows = (data || []) as StoreBackfillRow[];
  if (rows.length !== 1) throw new StoreSyncError("CONFLICT", "The import changed meanwhile. Reload.");
  await writeEvent(supabase, { companyId, connectionId: row.connection_id, type: state === "PAUSED" ? "BACKFILL_PAUSED" : "BACKFILL_RESUMED", actor });
  return rows[0];
}

function dayAfter(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * One step: read the next page of order ids and record each as due, then move
 * the cursor. The cursor only moves after the page is durably recorded, so a
 * crash or a store failure resumes at the same page; recording an order twice
 * is harmless (one sync row per order, one invoice per order).
 */
export async function runBackfillStep(
  supabase: SupabaseClient,
  companyId: string,
  backfillId: string,
  options: { deadline?: number; processLimit?: number } = {}
): Promise<{ backfill: StoreBackfillRow; recorded: number; processed: RunSummary }> {
  const { data: current, error } = await supabase.from(T_BACKFILLS).select("*").eq("company_id", companyId).eq("id", backfillId).maybeSingle();
  if (error) raiseDb(error, "Import lookup failed");
  if (!current) throw new StoreSyncError("NOT_FOUND", "Historical import not found.");
  const row = current as StoreBackfillRow;
  const connection = await loadConnection(supabase, companyId, row.connection_id);
  const idle: RunSummary = { processed: 0, outcomes: {}, remaining: false };
  if (row.status !== "RUNNING") return { backfill: row, recorded: 0, processed: idle };
  if (connection.status !== "ACTIVE") throw new StoreSyncError("CONFLICT", "The store's sync is not active.");

  let page: { ids: string[]; nextCursor: string | null };
  try {
    page = await connectorFor(connection.channel).listOrderIds(ref(connection), {
      createdFrom: row.created_from,
      createdBefore: row.created_to ? dayAfter(row.created_to) : null,
      cursor: row.cursor,
      pageSize: PAGE_SIZE,
    });
  } catch (fetchError) {
    const attempts = row.attempts + 1;
    const failed = attempts >= BACKFILL_MAX_FAILURES;
    const { data: updated, error: updateError } = await supabase
      .from(T_BACKFILLS)
      .update({ attempts, last_error: errorMessage(fetchError).slice(0, 1000), status: failed ? "FAILED" : "RUNNING", version: row.version + 1, updated_at: nowIso() })
      .eq("company_id", companyId)
      .eq("id", row.id)
      .eq("version", row.version)
      .select("*");
    if (updateError) raiseDb(updateError, "Update import failed");
    await recordFailure(supabase, connection, errorMessage(fetchError));
    await writeEvent(supabase, { companyId, connectionId: connection.id, type: "BACKFILL_PAGE_FAILED", actor: SYNC_ACTOR, detail: errorMessage(fetchError).slice(0, 500), metadata: { attempts, cursor: row.cursor } });
    return { backfill: ((updated || []) as StoreBackfillRow[])[0] || row, recorded: 0, processed: idle };
  }

  const recordedIds: string[] = [];
  for (const id of page.ids) recordedIds.push((await markOrderDue(supabase, connection, id, "historical import")).id);
  const done = !page.nextCursor;
  const { data: advanced, error: advanceError } = await supabase
    .from(T_BACKFILLS)
    .update({
      cursor: page.nextCursor ?? row.cursor,
      pages: row.pages + 1,
      orders_seen: row.orders_seen + recordedIds.length,
      attempts: 0,
      last_error: null,
      status: done ? "COMPLETED" : "RUNNING",
      completed_at: done ? nowIso() : null,
      version: row.version + 1,
      updated_at: nowIso(),
    })
    .eq("company_id", companyId)
    .eq("id", row.id)
    .eq("version", row.version)
    .select("*");
  if (advanceError) raiseDb(advanceError, "Advance import failed");
  const next = ((advanced || []) as StoreBackfillRow[])[0];
  if (!next) throw new StoreSyncError("CONFLICT", "The historical import was advanced by another request. Reload.");
  await supabase.from(T_CONNECTIONS).update({ last_sync_at: nowIso(), last_success_at: nowIso() }).eq("company_id", companyId).eq("id", connection.id);
  await writeEvent(supabase, {
    companyId,
    connectionId: connection.id,
    type: done ? "BACKFILL_COMPLETED" : "BACKFILL_PAGE",
    actor: SYNC_ACTOR,
    detail: `Page ${next.pages}: ${recordedIds.length} order(s) recorded for import.`,
    metadata: { cursor: next.cursor },
  });
  const processed = await processDueOrders(supabase, connection, { orderRowIds: recordedIds, limit: options.processLimit ?? PAGE_SIZE, deadline: options.deadline });
  return { backfill: next, recorded: recordedIds.length, processed };
}

// ---------------------------------------------------------------------------
// Scheduled run
// ---------------------------------------------------------------------------

/** Every active store, for the scheduled run. Service-role only. */
export async function listActiveConnections(supabase: SupabaseClient): Promise<StoreConnection[]> {
  const { data, error } = await supabase.from(T_CONNECTIONS).select("*").eq("status", "ACTIVE");
  if (error) raiseDb(error, "List stores failed");
  return (data || []) as StoreConnection[];
}

export async function runningBackfill(supabase: SupabaseClient, connection: StoreConnection): Promise<StoreBackfillRow | null> {
  const { data, error } = await supabase.from(T_BACKFILLS).select("*").eq("company_id", connection.company_id).eq("connection_id", connection.id).eq("status", "RUNNING").maybeSingle();
  if (error) raiseDb(error, "Import lookup failed");
  return (data as StoreBackfillRow) || null;
}

/** Catch-up is due when the last one is older than this. */
export const RECONCILE_EVERY_MS = 60 * 60 * 1000;
export function reconcileDue(connection: StoreConnection): boolean {
  return !connection.last_reconciled_at || storeRuntime.now() - Date.parse(connection.last_reconciled_at) >= RECONCILE_EVERY_MS;
}
