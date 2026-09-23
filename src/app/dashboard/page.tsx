import VyronCostAiShell from "@/components/VyronCostAiShell";
import DashboardExecutiveClient from "@/components/DashboardExecutiveClient";
import VyronMobileHomeLauncher from "@/components/vyron-mobile/VyronMobileHomeLauncher";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import { getDashboardOverview, EMPTY_OVERVIEW } from "@/lib/vyron-dashboard-overview";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { headers } from "next/headers";

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent") || "";
  const compactDevice = /Android|iPhone|iPad|iPod|Mobi/i.test(userAgent);
  const activeClient = await getServerActiveWorkspace();
  const tradingName = activeClient?.tradingName || activeClient?.companyName || "VOLORA";
  const title = `${tradingName} Command Centre`;

  if (compactDevice) {
    return (
      <VyronCostAiShell hidePageHeader title={title} subtitle="Touch-first launcher for your workspace.">
        <VyronMobileHomeLauncher workspaceName={tradingName} />
      </VyronCostAiShell>
    );
  }

  /*
   * Everything the dashboard shows is measured from this workspace's own
   * records. If the workspace cannot be resolved, or a read fails, the page
   * renders with the figures absent rather than with numbers that are not
   * true.
   */
  let overview = EMPTY_OVERVIEW;
  const companyId = await getWorkspaceCompanyId();
  if (companyId && isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        overview = await getDashboardOverview(supabase, companyId);
      } catch {
        overview = EMPTY_OVERVIEW;
      }
    }
  }

  return (
    <VyronCostAiShell hidePageHeader title={title} subtitle="Real-time cost, margin and operational intelligence.">
      <DashboardExecutiveClient overview={overview} />
    </VyronCostAiShell>
  );
}
