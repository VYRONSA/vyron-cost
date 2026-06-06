import CommercialLaunchCentreClient from "@/components/CommercialLaunchCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getLaunchReadinessSnapshot } from "@/lib/vyron-launch-readiness-data";

export default async function CommercialLaunchPage() {
  const snapshot = await getLaunchReadinessSnapshot();

  return (
    <VyronCostShell
      title="Commercial Launch Centre"
      subtitle="READINESS SCORE · CLIENT DEMO CONFIDENCE · LAUNCH BLOCKERS"
    >
      <CommercialLaunchCentreClient snapshot={snapshot} />
    </VyronCostShell>
  );
}
