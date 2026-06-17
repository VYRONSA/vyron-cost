import VyronCostAiShell from "@/components/VyronCostAiShell";
import ClientCompanySetupClient from "@/components/admin/ClientCompanySetupClient";

export default function ClientCompanySetupPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Company Setup" subtitle="Manage your workspace company details.">
      <ClientCompanySetupClient />
    </VyronCostAiShell>
  );
}
