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
  const name = client.companyName.toLowerCase();
  if (name.includes("handcrafted food")) return true;
  const pkg = (client.packageName || "").toLowerCase();
  if (pkg.includes("demo")) return true;
  return false;
}

function clientCookieSuffix() {
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return "; Secure";
  }
  return "";
}

export function syncActiveClientCookie(client: ActiveClient) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(client));
  document.cookie = `${ACTIVE_CLIENT_KEY}=${value}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${clientCookieSuffix()}`;
}

export function clearActiveClientCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${ACTIVE_CLIENT_KEY}=; path=/; max-age=0; SameSite=Lax${clientCookieSuffix()}`;
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
