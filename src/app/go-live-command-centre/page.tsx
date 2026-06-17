import GoLiveCommandCentreClient from "@/components/GoLiveCommandCentreClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function GoLiveCommandCentrePage() {
  return (
    <VyronCostShell hidePageHeader title="Go-Live Command Centre"
      subtitle="FINAL ROUTE CHECK · DEMO CONFIDENCE · CLIENT READINESS"
    >
      <GoLiveCommandCentreClient />
    </VyronCostShell>
  );
}
