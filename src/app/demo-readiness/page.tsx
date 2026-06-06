import DemoReadinessClient from "@/components/DemoReadinessClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function DemoReadinessPage() {
  return (
    <VyronCostShell
      title="Demo Readiness"
      subtitle="CLIENT DEMO TESTING · ROUTE CHECKS · FINAL CONFIDENCE"
    >
      <DemoReadinessClient />
    </VyronCostShell>
  );
}
