import GoLiveCommandCentreClient from "@/components/GoLiveCommandCentreClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function GoLiveCommandCentrePage() {
  return (
    <VyronCostShell
      title="Go-Live Command Centre"
      subtitle="FINAL ROUTE CHECK · DEMO CONFIDENCE · CLIENT READINESS"
    >
      <GoLiveCommandCentreClient />
    </VyronCostShell>
  );
}
