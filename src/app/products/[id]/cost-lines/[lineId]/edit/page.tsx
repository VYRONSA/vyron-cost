import ProductCostLineEditPageClient from "@/components/ProductCostLineEditPageClient";
import VyronCostShell from "@/components/VyronCostShell";
import {
  getDemoCompanyId,
  getProductCostLines,
  getProducts,
} from "@/lib/vyron-cost-data";

export default async function EditProductCostLinePage({
  params,
}: {
  params: Promise<{ id: string; lineId: string }>;
}) {
  const { id, lineId } = await params;

  const [products, costLines, companyId] = await Promise.all([
    getProducts(),
    getProductCostLines(),
    getDemoCompanyId(),
  ]);

  const product = products.find((item) => item.id === id) || products[0];
  const line = costLines.find((item) => item.id === lineId) || costLines[0];

  return (
    <VyronCostShell
      title={`Edit ${line?.line_name || "Cost Line"}`}
      subtitle="Edit one product costing line in a full-page workspace."
    >
      <ProductCostLineEditPageClient
        product={product}
        line={line}
        companyId={companyId}
      />
    </VyronCostShell>
  );
}
