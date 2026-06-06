import VyronCostAiShell from "@/components/VyronCostAiShell";
import XeroSetupClient from "@/components/vyron-cost/integrations/XeroSetupClient";

export default function Page() {
  return (
    <VyronCostAiShell
      title="Xero Setup"
      subtitle="CONNECTION STATUS · ACCOUNT MAPPING · OAUTH-READY STRUCTURE FOR LIVE XERO POSTING."
    >
      <XeroSetupClient />
    </VyronCostAiShell>
  );
}
