import type { WooCredentials } from "@/lib/store-sales/credentials";
import { StoreApiError, classifyHttp } from "@/lib/store-sales/errors";
import { storeRuntime, timedFetch } from "@/lib/store-sales/runtime";
import type { ConnectionRef, OrderIdPage, StoreConnector } from "@/lib/store-sales/connector";
import { normalizeWooOrder, type WooOrder, type WooRefund } from "@/lib/store-sales/woocommerce/normalize";

/**
 * WooCommerce connector — REST API v3 (/wp-json/wc/v3), read only.
 *
 * Authentication: HTTP Basic with the REST key (consumer key / secret) over
 * HTTPS; hosts that strip the Authorization header can use query-string auth
 * (credential flag queryStringAuth). The key needs Read permission only.
 */

export const WOO_API_PATH = "/wp-json/wc/v3";
export const WOO_WEBHOOK_TOPICS = ["order.created", "order.updated"] as const;

function credentialsFor(connection: ConnectionRef): WooCredentials {
  const credentials = storeRuntime.credentials("WOOCOMMERCE", connection.store_url);
  if (!credentials || credentials.kind !== "WOOCOMMERCE") throw new StoreApiError(`No WooCommerce API key is configured on the server for ${connection.store_url}.`, false);
  if (credentials.companyId !== connection.company_id.toLowerCase()) throw new StoreApiError(`The server API key for ${connection.store_url} belongs to another company.`, false);
  return credentials;
}

type WooResponse<T> = { body: T; headers: Headers } | null;

/** GET one REST resource. A 404 is null (no such order); anything else that is not 2xx throws. */
export async function wooGet<T>(connection: ConnectionRef, path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<WooResponse<T>> {
  const credentials = credentialsFor(connection);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value));
  const headers: Record<string, string> = { Accept: "application/json" };
  if (credentials.queryStringAuth) {
    query.set("consumer_key", credentials.consumerKey);
    query.set("consumer_secret", credentials.consumerSecret);
  } else {
    headers.Authorization = `Basic ${Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString("base64")}`;
  }
  const search = query.toString();
  const url = `${connection.store_url}${WOO_API_PATH}${path}${search ? `?${search}` : ""}`;
  const response = await timedFetch(url, { method: "GET", headers }, (message) => new StoreApiError(`WooCommerce ${message}.`, true));
  if (response.status === 404 && path.startsWith("/orders/")) return null;
  if (!response.ok) throw classifyHttp(response.status, `WooCommerce ${path.split("?")[0]}`, "WooCommerce");
  const text = await response.text();
  try {
    return { body: JSON.parse(text) as T, headers: response.headers };
  } catch {
    // Typically a security plugin, a maintenance page or permalinks set to "Plain".
    throw new StoreApiError("WooCommerce did not return JSON. Check the store address, that permalinks are not 'Plain', and that no security plugin blocks /wp-json.", false);
  }
}

function nextPage(page: number, headers: Headers, received: number, pageSize: number): string | null {
  const totalPages = Number(headers.get("x-wp-totalpages") || 0);
  if (totalPages > 0) return page < totalPages ? String(page + 1) : null;
  return received === pageSize ? String(page + 1) : null;
}

export const wooCommerceConnector: StoreConnector = {
  channel: "WOOCOMMERCE",

  async fetchSale(connection, orderId) {
    if (!/^\d{1,20}$/.test(orderId)) return null;
    const order = await wooGet<WooOrder>(connection, `/orders/${orderId}`);
    if (!order) return null;
    const refunds = (order.body.refunds || []).length ? await wooGet<WooRefund[]>(connection, `/orders/${orderId}/refunds`, { per_page: 100 }) : null;
    return normalizeWooOrder(order.body, refunds?.body || []);
  },

  async listOrderIds(connection, query): Promise<OrderIdPage> {
    const page = Math.max(Number(query.cursor) || 1, 1);
    // Ordered by id ascending: a new order gets a higher id and lands at the
    // end, so pages already read never shift under a long import.
    const params: Record<string, string | number | boolean | undefined> = { page, per_page: query.pageSize, orderby: "id", order: "asc", status: "any", _fields: "id" };
    if (query.updatedSince) {
      params.modified_after = query.updatedSince;
      params.dates_are_gmt = true;
    } else {
      params.after = `${query.createdFrom}T00:00:00`; // the store's own time zone
      if (query.createdBefore) params.before = /T/.test(query.createdBefore) ? query.createdBefore : `${query.createdBefore}T00:00:00`;
    }
    const result = await wooGet<Array<{ id: number | string }>>(connection, "/orders", params);
    const rows = result?.body || [];
    return { ids: rows.map((row) => String(row.id)), nextCursor: result ? nextPage(page, result.headers, rows.length, query.pageSize) : null };
  },

  async testConnection(connection) {
    const result = await wooGet<Array<{ id: number | string; currency?: string }>>(connection, "/orders", { per_page: 1, _fields: "id,currency" });
    const total = result?.headers.get("x-wp-total");
    const currency = result?.body?.[0]?.currency ? String(result.body[0].currency).toUpperCase() : null;
    return { name: connection.store_url.replace(/^https:\/\//, ""), currency, detail: `Read access confirmed · ${total ?? "?"} orders visible${currency ? ` · ${currency}` : ""}` };
  },
};
