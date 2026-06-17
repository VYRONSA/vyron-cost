import DeploymentReadinessAccessGuard from "@/components/admin/DeploymentReadinessAccessGuard";
import DeploymentReadinessClient from "@/components/admin/DeploymentReadinessClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function DeploymentReadinessPage() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Deployment Readiness"
      subtitle="Production environment checklist before go-live."
    >
      <DeploymentReadinessAccessGuard>
        <DeploymentReadinessClient />
      </DeploymentReadinessAccessGuard>
    </VyronCostAiShell>
  );
}
