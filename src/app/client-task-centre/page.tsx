import ClientTaskCentreClient from "@/components/ClientTaskCentreClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function ClientTaskCentrePage() {
  return (
    <VyronCostShell
      title="Client Task Centre"
      subtitle="IMPLEMENTATION TASKS · CLIENT FOLLOW-UP · DEMO ACTIONS"
    >
      <ClientTaskCentreClient />
    </VyronCostShell>
  );
}
