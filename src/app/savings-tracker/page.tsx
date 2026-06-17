import SavingsTrackerClient from "@/components/SavingsTrackerClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function SavingsTrackerPage() {
  return (
    <VyronCostShell hidePageHeader title="Savings Tracker"
      subtitle="APPROVED SAVINGS · IMPLEMENTED RECOVERY · MONTHLY VALUE"
    >
      <SavingsTrackerClient />
    </VyronCostShell>
  );
}
