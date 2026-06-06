import CategoryReportClient from "@/components/reports/CategoryReportClient";
import MetricCard from "@/components/MetricCard";
import VyronCostShell from "@/components/VyronCostShell";
import { Boxes, Building2, FolderTree, PackageSearch } from "lucide-react";
import { getCategories, getIngredients, getProducts, getRecipes, getSuppliers } from "@/lib/vyron-cost-data";

export default async function CategoryUsageReportPage() {
  const [categories, products, ingredients, suppliers, recipes] = await Promise.all([
    getCategories(),
    getProducts(),
    getIngredients(),
    getSuppliers(),
    getRecipes(),
  ]);

  return (
    <VyronCostShell title="Category Usage Report" subtitle="Dedicated category-control report across all master-data areas.">
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <MetricCard title="Categories" value={String(categories.length)} note="Category master" icon={FolderTree} />
        <MetricCard title="Products" value={String(products.length)} note="Product records" icon={PackageSearch} />
        <MetricCard title="Ingredients" value={String(ingredients.length)} note="Ingredient records" icon={Boxes} />
        <MetricCard title="Suppliers" value={String(suppliers.length)} note="Supplier records" icon={Building2} dark />
      </section>
      <CategoryReportClient
        categories={categories}
        products={products}
        ingredients={ingredients}
        suppliers={suppliers}
        recipes={recipes}
      />
    </VyronCostShell>
  );
}
