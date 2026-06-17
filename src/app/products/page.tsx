import ProductManagerClient from "@/components/ProductManagerClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getProductFormData } from "@/lib/vyron-cost-product-data";

export default async function ProductsPage() {
  const { products, boms } = await getProductFormData();
  return (
    <VyronCostAiShell hidePageHeader title="Finished Products" subtitle="Create products and link them to BOMs so cost, GP and suggested price calculate automatically.">
      <ProductManagerClient initialProducts={products} boms={boms} />
    </VyronCostAiShell>
  );
}
