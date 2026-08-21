import ProductMarginReportClient from "@/components/reports/ProductMarginReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getProducts } from "@/lib/vyron-cost-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

/**
 * Product Margin Report ("Product GP").
 *
 * Summary figures live in the report document rather than in shell metric
 * cards, so the printed and exported report carries the same numbers the
 * screen shows. The previous page also published an "Opportunity" rand value
 * derived from a hard-coded 1,200 units per product per month; no such volume
 * is measured anywhere, so that figure has been dropped rather than restated.
 */
export default async function ProductMarginReportPage() {
  const [products, companyName] = await Promise.all([getProducts(500), getReportCompanyName()]);

  return (
    <VyronCostAiShell
      hidePageHeader
      wide
      title="Product Margin Report"
      subtitle="PRODUCT GP, MARGIN AND PRICE REVIEW."
    >
      <ProductMarginReportClient
        products={products}
        companyName={companyName}
        generatedAt={new Date().toISOString()}
      />
    </VyronCostAiShell>
  );
}
