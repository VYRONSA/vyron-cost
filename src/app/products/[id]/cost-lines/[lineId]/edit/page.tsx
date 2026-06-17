import EditRouteGuard from "@/components/EditRouteGuard";
import ProductCostLineEditPageClient from "@/components/ProductCostLineEditPageClient";
import VyronCostShell from "@/components/VyronCostShell";
import {
  getDemoCompanyId,
  getProductById,
  getProductCostLines,
  isCostLineForProduct,
} from "@/lib/vyron-cost-data";
import { notFound } from "next/navigation";

export default async function EditProductCostLinePage({
  params,
}: {
  params: Promise<{ id: string; lineId: string }>;
}) {
  const { id, lineId } = await params;

  const [product, allCostLines, companyId] = await Promise.all([
    getProductById(id),
    getProductCostLines(),
    getDemoCompanyId(),
  ]);

  if (!product) notFound();

  const line = allCostLines.find(
    (item) => item.id === lineId && isCostLineForProduct(item, product)
  );
  if (!line) notFound();

  return (
    <VyronCostShell hidePageHeader title={`Edit ${line.line_name}`}
      subtitle="Edit one product costing line in a full-page workspace."
    >
      <EditRouteGuard permission="edit_products">
        <ProductCostLineEditPageClient
          product={product}
          line={line}
          companyId={companyId}
        />
      </EditRouteGuard>
    </VyronCostShell>
  );
}
