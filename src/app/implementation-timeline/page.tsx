import ImplementationTimelineClient from "@/components/ImplementationTimelineClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function ImplementationTimelinePage() {
  return (
    <VyronCostShell hidePageHeader title="Implementation Timeline"
      subtitle="CLIENT ROLLOUT · WEEKLY PLAN · GO-LIVE PATH"
    >
      <ImplementationTimelineClient />
    </VyronCostShell>
  );
}
