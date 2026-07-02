import type { ReactNode } from "react";
import { enforceAuthenticatedDashboardDynamicRendering } from "@/lib/vyron-authenticated-dashboard-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default function EnterpriseLayout({ children }: { children: ReactNode }) {
  enforceAuthenticatedDashboardDynamicRendering();
  return children;
}
