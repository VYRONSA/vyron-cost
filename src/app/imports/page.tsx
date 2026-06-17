import ImportsCentreClient from "@/components/ImportsCentreClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function ImportsPage() {
  return (
    <VyronCostShell hidePageHeader title="Bulk Import Centre" subtitle="Download templates, validate CSV uploads and import master data at scale.">
      <ImportsCentreClient />
    </VyronCostShell>
  );
}
