import VyronCostAiShell from "@/components/VyronCostAiShell";
import XeroSyncCentreClient from "@/components/vyron-cost/integrations/XeroSyncCentreClient";

export default function Page() {
  return (
    <VyronCostAiShell
      title="Xero Sync Centre"
      subtitle="REVIEW, APPROVE AND MONITOR ACCOUNTING SYNC JOBS BETWEEN VYRON COST AND XERO."
    >
      <XeroSyncCentreClient />
    </VyronCostAiShell>
  );
}
