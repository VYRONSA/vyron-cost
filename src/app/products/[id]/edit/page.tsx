import EditRouteGuard from "@/components/EditRouteGuard";
import ProductEditPageClient from "@/components/ProductEditPageClient";
import VyronCostShell from "@/components/VyronCostShell";
import {
  getDemoCompanyId,
  getProductById,
  getProductCostLines,
  isCostLineForProduct,
} from "@/lib/vyron-cost-data";
import { notFound } from "next/navigation";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, allCostLines, companyId] = await Promise.all([
    getProductById(id),
    getProductCostLines(),
    getDemoCompanyId(),
  ]);

  if (!product) notFound();

  const costLines = allCostLines.filter((line) => isCostLineForProduct(line, product));

  return (
    <VyronCostShell hidePageHeader title={`Edit ${product.product_name}`}
      subtitle="Full product costing with ingredients, packaging, salaries, wastage, overheads, cost price, selling price and margin."
    >
      <EditRouteGuard permission="edit_products">
        <ProductEditPageClient
          product={product}
          costLines={costLines}
          companyId={companyId}
        />
      </EditRouteGuard>
    </VyronCostShell>
  );
}
