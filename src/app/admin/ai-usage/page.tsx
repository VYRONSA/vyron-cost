import VyronCostAiShell from "@/components/VyronCostAiShell";
import AiUsageDashboardClient from "@/components/admin/AiUsageDashboardClient";

export default function AiUsageAdminPage() {
  return (
    <VyronCostAiShell hidePageHeader title="AI Usage & Billing" subtitle="Monitor AI consumption, allowance, and projected spend for this workspace.">
      <AiUsageDashboardClient />
    </VyronCostAiShell>
  );
}
