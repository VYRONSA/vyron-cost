import TrainingCentreClient from "@/components/TrainingCentreClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function TrainingCentrePage() {
  return (
    <VyronCostShell
      title="Training Centre"
      subtitle="SETUP GUIDE · DEMO GUIDE · CLIENT MANUAL"
    >
      <TrainingCentreClient />
    </VyronCostShell>
  );
}
