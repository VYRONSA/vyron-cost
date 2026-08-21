import CategoryReportClient from "@/components/reports/CategoryReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getCategories, getIngredients, getProducts, getRecipes, getSuppliers } from "@/lib/vyron-cost-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

export default async function CategoryUsageReportPage() {
  const [categories, products, ingredients, suppliers, recipes, companyName] = await Promise.all([
    getCategories(),
    getProducts(1000),
    getIngredients(1000),
    getSuppliers(500),
    getRecipes(1000),
    getReportCompanyName(),
  ]);

  return (
    <VyronCostAiShell hidePageHeader wide title="Category Usage Report" subtitle="CATEGORY CONTROL ACROSS MASTER DATA.">
      <CategoryReportClient
        categories={categories}
        products={products}
        ingredients={ingredients}
        suppliers={suppliers}
        recipes={recipes}
        companyName={companyName}
        generatedAt={new Date().toISOString()}
      />
    </VyronCostAiShell>
  );
}
