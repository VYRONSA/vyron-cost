import ProductLaunchChecklistClient from "@/components/ProductLaunchChecklistClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function ProductLaunchChecklistPage() {
  return (
    <VyronCostShell
      title="Product Launch Checklist"
      subtitle="BOM · COST · GP · SUPPLIER · APPROVAL"
    >
      <ProductLaunchChecklistClient />
    </VyronCostShell>
  );
}
