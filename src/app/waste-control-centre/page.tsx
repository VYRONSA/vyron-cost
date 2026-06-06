import WasteControlCentreClient from "@/components/WasteControlCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getBranchRiskFindings } from "@/lib/vyron-leakage-intelligence-data";

export default async function WasteControlCentrePage() {
  const branches = await getBranchRiskFindings();

  return (
    <VyronCostShell
      title="Waste Control Centre"
      subtitle="WASTAGE VALUE · RECOVERABLE LOSS · BRANCH CONTROL"
    >
      <WasteControlCentreClient branches={branches} />
    </VyronCostShell>
  );
}
