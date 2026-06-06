import DataQualityCentreClient from "@/components/DataQualityCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";

export default async function DataQualityCentrePage() {
  const [products, suppliers] = await Promise.all([
    getProductIntelligence(),
    getSupplierIntelligenceRows(),
  ]);

  return (
    <VyronCostShell
      title="Data Quality Centre"
      subtitle="MISSING LINKS · GP ISSUES · SUPPLIER QUALITY · DEMO CLEANUP"
    >
      <DataQualityCentreClient products={products} suppliers={suppliers} />
    </VyronCostShell>
  );
}
