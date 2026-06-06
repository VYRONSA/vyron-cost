import ProductEditPageClient from "@/components/ProductEditPageClient";
import VyronCostShell from "@/components/VyronCostShell";
import {
  getDemoCompanyId,
  getProductCostLines,
  getProducts,
} from "@/lib/vyron-cost-data";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [products, costLines, companyId] = await Promise.all([
    getProducts(),
    getProductCostLines(),
    getDemoCompanyId(),
  ]);

  const product = products.find((item) => item.id === id) || products[0];

  return (
    <VyronCostShell
      title={`Edit ${product?.product_name || "Product"}`}
      subtitle="Full product costing with ingredients, packaging, salaries, wastage, overheads, cost price, selling price and margin."
    >
      <ProductEditPageClient
        product={product}
        costLines={costLines}
        companyId={companyId}
      />
    </VyronCostShell>
  );
}
