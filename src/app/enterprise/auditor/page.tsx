import AuditorWorkspaceClient from "@/components/enterprise/AuditorWorkspaceClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function AuditorWorkspacePage() {
  return (
    <VyronCostShell hidePageHeader title="Auditor Workspace" subtitle="READ-ONLY · SEARCH · AUDIT TRAIL ACCESS">
      <AuditorWorkspaceClient />
    </VyronCostShell>
  );
}
