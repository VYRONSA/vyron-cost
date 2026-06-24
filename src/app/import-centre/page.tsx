import VyronCostAiShell from "@/components/VyronCostAiShell";
import ImportCentreClient from "@/components/vyron-cost/imports/ImportCentreClient";

export default function Page() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Import Centre"
      subtitle="IMPORT RAW MATERIALS, FINISHED GOODS, AND BOMS INTO YOUR WORKSPACE."
    >
      <ImportCentreClient />
    </VyronCostAiShell>
  );
}
