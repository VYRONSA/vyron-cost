import type { Metadata } from "next";
import DeveloperResetCentreClient from "@/components/vyron-cost/developer/DeveloperResetCentreClient";

/**
 * PCP-045 — Developer Supervisor Reset Centre.
 *
 * Reachable by direct URL only. It is deliberately absent from every navigation
 * surface, and marked noindex/nofollow so it never appears in search.
 */
export const metadata: Metadata = {
  title: "Reset Centre — Developer Supervisor",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default function DeveloperResetCentrePage() {
  return <DeveloperResetCentreClient />;
}
