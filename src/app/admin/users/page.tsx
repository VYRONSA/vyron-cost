import VyronCostAiShell from "@/components/VyronCostAiShell";
import ClientUserSetupClient from "@/components/admin/ClientUserSetupClient";

export default function ClientUsersPage() {
  return (
    <VyronCostAiShell hidePageHeader title="User Setup" subtitle="Create and manage workspace users, roles and permissions.">
      <ClientUserSetupClient />
    </VyronCostAiShell>
  );
}
