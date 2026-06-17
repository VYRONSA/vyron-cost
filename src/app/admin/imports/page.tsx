import VyronCostAiShell from "@/components/VyronCostAiShell";
import ClientImportCentreClient from "@/components/admin/ClientImportCentreClient";

export default function ClientImportsPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Import Centre" subtitle="Bulk import setup data for your workspace.">
      <ClientImportCentreClient />
    </VyronCostAiShell>
  );
}
