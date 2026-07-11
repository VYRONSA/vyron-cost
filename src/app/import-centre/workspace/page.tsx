import VyronCostAiShell from "@/components/VyronCostAiShell";
import ImportCentreClient from "@/components/vyron-cost/imports/ImportCentreClient";

export default function ImportCentreWorkspacePage() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Workspace Import Centre"
      subtitle="RUN VALIDATED RAW MATERIAL, FINISHED GOODS, AND BOM IMPORTS USING THE EXISTING WORKSPACE ENGINE."
    >
      <ImportCentreClient />
    </VyronCostAiShell>
  );
}
