import BranchPerformanceClient from "@/components/BranchPerformanceClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getBranchRiskFindings } from "@/lib/vyron-leakage-intelligence-data";

export default async function BranchPerformancePage() {
  const branches = await getBranchRiskFindings();

  return (
    <VyronCostShell
      title="Branch Performance"
      subtitle="SPEND · WASTAGE · GP EROSION · PROCUREMENT EFFICIENCY"
    >
      <BranchPerformanceClient branches={branches} />
    </VyronCostShell>
  );
}
