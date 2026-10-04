import type { ShopifyCredentials } from "@/lib/store-sales/credentials";
import { StoreApiError, StoreSyncError, classifyHttp } from "@/lib/store-sales/errors";
import { storeRuntime, timedFetch } from "@/lib/store-sales/runtime";
import type { ConnectionRef, OrderIdPage, OrderListQuery, StoreConnector } from "@/lib/store-sales/connector";
import { normalizeShopifyOrder, type GqlLineItem, type GqlOrder, type GqlRefund } from "@/lib/store-sales/shopify/normalize";
import {
  ORDER_IDS_PAGE_QUERY,
  ORDER_LINE_ITEMS_PAGE_QUERY,
  ORDER_QUERY,
  REFUND_QUERY,
  SHOP_QUERY,
  WEBHOOK_SUBSCRIPTIONS_QUERY,
  WEBHOOK_SUBSCRIPTION_CREATE,
  orderGid,
} from "@/lib/store-sales/shopify/queries";

/**
 * Shopify connector — Admin GraphQL API. Server-only: the token is obtained
 * and used here and never leaves this module. Read scopes only; the one
 * mutation is a webhook subscription, which Shopify allows with read_orders.
 */

/** Admin GraphQL API version (latest stable as of 2026-10). */
export const SHOPIFY_API_VERSION = "2026-10";
export const SHOPIFY_REQUIRED_SCOPES = ["read_orders"] as const;
/** Only for importing orders older than 60 days; Shopify must approve it. */
export const SHOPIFY_HISTORY_SCOPE = "read_all_orders";
export const SHOPIFY_WEBHOOK_TOPICS = ["ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_CANCELLED", "REFUNDS_CREATE"] as const;
export const SHOPIFY_STATUSES = ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED", "REFUNDED", "PENDING", "AUTHORIZED", "VOIDED", "EXPIRED"];

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** For tests: forget cached client-credential tokens. */
export function clearShopifyTokenCache(): void {
  tokenCache.clear();
}

const shopDomain = (connection: ConnectionRef) => connection.store_url.replace(/^https:\/\//, "");

function credentialsFor(connection: ConnectionRef): ShopifyCredentials {
  const credentials = storeRuntime.credentials("SHOPIFY", connection.store_url);
  if (!credentials || credentials.kind !== "SHOPIFY") throw new StoreApiError(`No Shopify credentials are configured on the server for ${shopDomain(connection)}.`, false);
  if (credentials.companyId !== connection.company_id.toLowerCase()) throw new StoreApiError(`The server credentials for ${shopDomain(connection)} belong to another company.`, false);
  return credentials;
}

const failure = (context: string) => (message: string) => new StoreApiError(`${context}: Shopify ${message}.`, true);

async function accessToken(domain: string, credentials: ShopifyCredentials, forceRefresh = false): Promise<string> {
  if (credentials.accessToken) return credentials.accessToken;
  const cached = tokenCache.get(domain);
  if (!forceRefresh && cached && cached.expiresAt - 60_000 > storeRuntime.now()) return cached.token;
  const response = await timedFetch(
    `https://${domain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: String(credentials.clientId), client_secret: credentials.clientSecret }).toString(),
    },
    failure("Obtaining an access token")
  );
  if (!response.ok) throw classifyHttp(response.status, "Obtaining an access token", "Shopify");
  const body = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!body?.access_token) throw new StoreApiError("Shopify returned no access token.", false);
  tokenCache.set(domain, { token: body.access_token, expiresAt: storeRuntime.now() + Number(body.expires_in || 3600) * 1000 });
  return body.access_token;
}

type GraphqlError = { message?: string; extensions?: { code?: string } };

/** Run one Admin GraphQL document. Throws StoreApiError (retryable or not). */
export async function shopifyGraphql<T>(connection: ConnectionRef, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const credentials = credentialsFor(connection);
  const domain = shopDomain(connection);
  const attempt = async (forceRefresh: boolean) => {
    const token = await accessToken(domain, credentials, forceRefresh);
    return timedFetch(
      `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({ query, variables }) },
      failure("Shopify query")
    );
  };
  let response = await attempt(false);
  if (response.status === 401 && !credentials.accessToken) {
    tokenCache.delete(domain); // an expired client-credentials token: one fresh try
    response = await attempt(true);
  }
  if (!response.ok) throw classifyHttp(response.status, "Shopify query", "Shopify");
  const body = (await response.json().catch(() => null)) as { data?: T; errors?: GraphqlError[] } | null;
  if (!body) throw new StoreApiError("Shopify returned an unreadable response.", true);
  if (Array.isArray(body.errors) && body.errors.length) {
    const codes = body.errors.map((e) => String(e.extensions?.code || ""));
    const message = body.errors.map((e) => e.message || "error").join("; ").slice(0, 500);
    throw new StoreApiError(`Shopify query: ${message}`, codes.includes("THROTTLED") || codes.includes("INTERNAL_SERVER_ERROR"));
  }
  if (!body.data) throw new StoreApiError("Shopify returned no data.", true);
  return body.data;
}

function listingQuery(query: OrderListQuery): { search: string; sortKey: "CREATED_AT" | "UPDATED_AT" } {
  if (query.updatedSince) return { search: `updated_at:>=${query.updatedSince}`, sortKey: "UPDATED_AT" };
  const parts = [`created_at:>=${query.createdFrom}`];
  if (query.createdBefore) parts.push(`created_at:<${query.createdBefore}`);
  return { search: parts.join(" "), sortKey: "CREATED_AT" };
}

export const shopifyConnector: StoreConnector = {
  channel: "SHOPIFY",

  async fetchSale(connection, orderId) {
    const gid = orderGid(orderId);
    const first = await shopifyGraphql<{ shop?: { ianaTimezone?: string | null }; order: GqlOrder | null }>(connection, ORDER_QUERY, { id: gid });
    if (!first.order) return null;
    const items: GqlLineItem[] = [...(first.order.lineItems?.nodes || [])];
    let page = first.order.lineItems?.pageInfo;
    for (let guard = 0; page?.hasNextPage && guard < 20; guard++) {
      const next = await shopifyGraphql<{ order: { lineItems: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GqlLineItem[] } } | null }>(
        connection,
        ORDER_LINE_ITEMS_PAGE_QUERY,
        { id: gid, after: page.endCursor }
      );
      if (!next.order) break;
      items.push(...next.order.lineItems.nodes);
      page = next.order.lineItems.pageInfo;
    }
    const refunds: GqlRefund[] = [];
    for (const ref of first.order.refunds || []) {
      const result = await shopifyGraphql<{ refund: GqlRefund | null }>(connection, REFUND_QUERY, { id: ref.id });
      if (result.refund) refunds.push(result.refund);
    }
    return normalizeShopifyOrder(first.order, items, refunds, first.shop || {});
  },

  async listOrderIds(connection, query): Promise<OrderIdPage> {
    const { search, sortKey } = listingQuery(query);
    const result = await shopifyGraphql<{ orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Array<{ legacyResourceId: string | number }> } }>(
      connection,
      ORDER_IDS_PAGE_QUERY,
      { first: query.pageSize, after: query.cursor, query: search, sortKey }
    );
    return {
      ids: (result.orders.nodes || []).map((node) => String(node.legacyResourceId)),
      nextCursor: result.orders.pageInfo?.hasNextPage ? result.orders.pageInfo.endCursor : null,
    };
  },

  async testConnection(connection) {
    const data = await shopifyGraphql<{ shop: { name: string; myshopifyDomain: string; currencyCode: string; ianaTimezone: string | null } }>(connection, SHOP_QUERY);
    return { name: data.shop.name, currency: data.shop.currencyCode, detail: `${data.shop.myshopifyDomain} · ${data.shop.currencyCode} · ${data.shop.ianaTimezone || "time zone unknown"}` };
  },

  async registerWebhooks(connection, callbackUrl) {
    if (!/^https:\/\//.test(callbackUrl)) throw new StoreSyncError("INVALID_INPUT", "Webhooks need a public https address (set NEXT_PUBLIC_APP_URL).");
    const existing = await shopifyGraphql<{ webhookSubscriptions: { nodes: Array<{ id: string; topic: string; uri: string }> } }>(connection, WEBHOOK_SUBSCRIPTIONS_QUERY);
    const subscriptions = existing.webhookSubscriptions.nodes.filter((s) => s.uri === callbackUrl);
    for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
      if (subscriptions.some((s) => s.topic === topic)) continue;
      const created = await shopifyGraphql<{
        webhookSubscriptionCreate: { webhookSubscription: { id: string; topic: string; uri: string } | null; userErrors: Array<{ message: string }> };
      }>(connection, WEBHOOK_SUBSCRIPTION_CREATE, { topic, uri: callbackUrl });
      const errors = created.webhookSubscriptionCreate.userErrors || [];
      if (errors.length || !created.webhookSubscriptionCreate.webhookSubscription) {
        throw new StoreSyncError("CONFLICT", `Shopify refused the ${topic} subscription: ${errors.map((e) => e.message).join("; ") || "no subscription returned"}.`);
      }
      subscriptions.push(created.webhookSubscriptionCreate.webhookSubscription);
    }
    return subscriptions;
  },
};
