import BulkImportCentreClient from "@/components/BulkImportCentreClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function BulkImportCentrePage() {
  return (
    <VyronCostShell
      title="Bulk Import Centre"
      subtitle="TEMPLATES · UPLOADS · VALIDATION · IMPORT STAGING"
    >
      <BulkImportCentreClient />
    </VyronCostShell>
  );
}
