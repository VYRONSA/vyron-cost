import { unstable_noStore as noStore } from "next/cache";

/**
 * Shared boundary for authenticated enterprise dashboards.
 * Any route using dashboard shell components should call this once per request
 * to prevent static prerendering of live workspace/company data.
 */
export function enforceAuthenticatedDashboardDynamicRendering() {
  noStore();
}
