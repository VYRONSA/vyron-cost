import { ACTIVE_CLIENT_KEY, readActiveClient, type ActiveClient } from "@/lib/vyron-developer-client";

export const HANDCRAFTED_DEMO_WORKSPACE_IDS = new Set([
  "client-001",
  "handcrafted-fp",
  "48002864-8800-4000-9000-000000000001",
]);

export const EMPTY_WORKSPACE_ONBOARDING = {
  title: "No data yet",
  message:
    "Start by adding suppliers, ingredients, recipes, products, and opening stock.",
  metrics: {
    suppliers: 0,
    ingredients: 0,
    products: 0,
    inventoryValue: 0,
    customerInvoices: 0,
    xeroConnected: false,
  },
} as const;

export function isDemoWorkspace(client: ActiveClient | null | undefined): boolean {
  if (!client) return false;
  if (client.demoMode === true) return true;
  if (client.demoMode === false) return false;
  if (client.status === "Demo") return true;
  if (HANDCRAFTED_DEMO_WORKSPACE_IDS.has(client.id)) return true;
  /**
   * Demo status is decided by explicit signals only — never by company name.
   * A live customer whose trading name happens to contain a demo-sounding word
   * (e.g. "Handcrafted Food Products (Pty) Ltd") is a production workspace and
   * must read its real persisted data.
   */
  const pkg = (client.packageName || "").toLowerCase();
  if (pkg.includes("demo")) return true;
  return false;
}

/** Server-only cookies — client code must not write workspace auth cookies. */
export function syncActiveClientCookie(_client: ActiveClient) {
  // no-op: workspace cookies are set only by server routes
}

/** Server-only cookies — client code must not clear workspace auth cookies. */
export function clearActiveClientCookie() {
  // no-op: use POST /api/workspace/logout
}

/** Client-side helper for banners and UI gating. */
export function isActiveClientDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return isDemoWorkspace(readActiveClient());
}

export function documentHasCookie(name: string): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => part.trim().startsWith(`${name}=`));
}

export { ACTIVE_CLIENT_KEY };
