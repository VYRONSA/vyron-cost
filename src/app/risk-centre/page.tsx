import RiskCentreClient from "@/components/enterprise/RiskCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getRiskCentre } from "@/lib/vyron-enterprise-platform";

export default async function RiskCentrePage() {
  const risks = await getRiskCentre();
  return (
    <VyronCostShell hidePageHeader title="Risk Centre" subtitle="SUPPLIER · INVENTORY · PRODUCTION · LEAKAGE · FRAUD">
      <RiskCentreClient risks={risks} />
    </VyronCostShell>
  );
}
