import type { StoreChannel } from "@/lib/store-sales/types";

/**
 * Store credentials — server environment only, never the database, never the
 * browser, never source code.
 *
 * VOLORA is multi-tenant, so a credential is not "the" store's credential for
 * the deployment: every entry names the company (companyId) that owns the
 * store, and is only ever used for that company's connection. A company admin
 * cannot connect another tenant's store URL and receive its orders.
 *
 * Two forms, both server-side:
 *
 * 1. One JSON variable per channel, any number of stores:
 *    VYRON_SHOPIFY_CREDENTIALS = {"<shop>.myshopify.com": {"companyId": "…", "clientId": "…", "clientSecret": "…"}}
 *        (or "accessToken": "shpat_…" instead of clientId; clientSecret is always required — it signs webhooks)
 *    VYRON_WOOCOMMERCE_CREDENTIALS = {"https://shop.example": {"companyId": "…", "consumerKey": "ck_…", "consumerSecret": "cs_…", "webhookSecret": "…"}}
 *
 * 2. Single-store variables (one store per channel for the deployment):
 *    SHOPIFY_STORE_DOMAIN, SHOPIFY_COMPANY_ID, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_ADMIN_ACCESS_TOKEN
 *    WOOCOMMERCE_STORE_URL, WOOCOMMERCE_COMPANY_ID, WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET, WOOCOMMERCE_WEBHOOK_SECRET
 *    (optional WOOCOMMERCE_QUERY_STRING_AUTH=true for hosts that strip the Authorization header)
 *
 * A malformed value yields no credentials. Values are never echoed or logged.
 */

export type ShopifyCredentials = { kind: "SHOPIFY"; companyId: string; clientId: string | null; clientSecret: string; accessToken: string | null };
export type WooCredentials = {
  kind: "WOOCOMMERCE";
  companyId: string;
  consumerKey: string;
  consumerSecret: string;
  webhookSecret: string | null;
  queryStringAuth: boolean;
};
export type StoreCredentials = ShopifyCredentials | WooCredentials;

type Env = Record<string, string | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

export const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** https://<shop>.myshopify.com, or null. */
export function canonicalShopifyUrl(value: unknown): string | null {
  const domain = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  return SHOP_DOMAIN_PATTERN.test(domain) ? `https://${domain}` : null;
}

/**
 * The WooCommerce site URL as VOLORA stores it: https, lower-case host, no
 * trailing slash, no query. A WordPress in a sub-directory keeps its path.
 * Plain http is refused: the API key travels in every request.
 */
export function canonicalWooUrl(value: unknown): string | null {
  let url: URL;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (path && !/^[A-Za-z0-9._~/-]*$/.test(path)) return null;
  return `https://${url.host.toLowerCase()}${path}`;
}

export function canonicalStoreUrl(channel: StoreChannel, value: unknown): string | null {
  return channel === "SHOPIFY" ? canonicalShopifyUrl(value) : canonicalWooUrl(value);
}

function jsonEntry(raw: string | undefined, storeUrl: string, canonical: (value: unknown) => string | null): Record<string, unknown> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (canonical(key) === storeUrl && value && typeof value === "object") return value as Record<string, unknown>;
  }
  return null;
}

function shopify(entry: Record<string, unknown> | null): ShopifyCredentials | null {
  if (!entry) return null;
  const companyId = str(entry.companyId);
  const clientSecret = str(entry.clientSecret);
  const clientId = str(entry.clientId);
  const accessToken = str(entry.accessToken);
  if (!companyId || !UUID.test(companyId) || !clientSecret || (!clientId && !accessToken)) return null;
  return { kind: "SHOPIFY", companyId: companyId.toLowerCase(), clientId, clientSecret, accessToken };
}

function woo(entry: Record<string, unknown> | null): WooCredentials | null {
  if (!entry) return null;
  const companyId = str(entry.companyId);
  const consumerKey = str(entry.consumerKey);
  const consumerSecret = str(entry.consumerSecret);
  if (!companyId || !UUID.test(companyId) || !consumerKey || !consumerSecret) return null;
  return {
    kind: "WOOCOMMERCE",
    companyId: companyId.toLowerCase(),
    consumerKey,
    consumerSecret,
    webhookSecret: str(entry.webhookSecret),
    queryStringAuth: entry.queryStringAuth === true || entry.queryStringAuth === "true",
  };
}

/** The credential entry for one store, whichever form provides it (the JSON map wins). */
export function loadStoreCredentials(channel: StoreChannel, storeUrl: string, env: Env = process.env): StoreCredentials | null {
  if (channel === "SHOPIFY") {
    const fromMap = shopify(jsonEntry(env.VYRON_SHOPIFY_CREDENTIALS, storeUrl, canonicalShopifyUrl));
    if (fromMap) return fromMap;
    if (canonicalShopifyUrl(env.SHOPIFY_STORE_DOMAIN) !== storeUrl) return null;
    return shopify({
      companyId: env.SHOPIFY_COMPANY_ID,
      clientId: env.SHOPIFY_CLIENT_ID,
      clientSecret: env.SHOPIFY_CLIENT_SECRET,
      accessToken: env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    });
  }
  const fromMap = woo(jsonEntry(env.VYRON_WOOCOMMERCE_CREDENTIALS, storeUrl, canonicalWooUrl));
  if (fromMap) return fromMap;
  if (canonicalWooUrl(env.WOOCOMMERCE_STORE_URL) !== storeUrl) return null;
  return woo({
    companyId: env.WOOCOMMERCE_COMPANY_ID,
    consumerKey: env.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: env.WOOCOMMERCE_CONSUMER_SECRET,
    webhookSecret: env.WOOCOMMERCE_WEBHOOK_SECRET,
    queryStringAuth: env.WOOCOMMERCE_QUERY_STRING_AUTH,
  });
}

export type CredentialState = "CONFIGURED" | "MISSING" | "OTHER_COMPANY";

export function credentialState(credentials: StoreCredentials | null, companyId: string): CredentialState {
  if (!credentials) return "MISSING";
  return credentials.companyId === companyId.toLowerCase() ? "CONFIGURED" : "OTHER_COMPANY";
}
