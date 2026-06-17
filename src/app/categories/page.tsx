import { FolderTree, Layers3, PackageSearch, Tags } from "lucide-react";
import CategoriesManager from "@/components/CategoriesManager";
import MetricCard from "@/components/MetricCard";
import VyronCostShell from "@/components/VyronCostShell";
import { getCategories, getDemoCompanyId } from "@/lib/vyron-cost-data";

export default async function CategoriesPage() {
  const [categories, companyId] = await Promise.all([getCategories(), getDemoCompanyId()]);
  return (
    <VyronCostShell hidePageHeader title="Categories" subtitle="Create, edit, delete and control categories used across products, ingredients, suppliers, recipes and costing lines.">
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <MetricCard title="Categories" value={String(categories.length)} note="Total category rules" icon={FolderTree} />
        <MetricCard title="Product Categories" value={String(categories.filter((c) => c.category_type === "Product").length)} note="Used by products" icon={PackageSearch} />
        <MetricCard title="Costing Categories" value={String(categories.filter((c) => c.category_type === "Costing").length)} note="Used by BOM lines" icon={Layers3} />
        <MetricCard title="Active" value={String(categories.filter((c) => c.status === "Active").length)} note="Currently active" icon={Tags} dark />
      </section>
      <CategoriesManager initialCategories={categories} companyId={companyId} />
    </VyronCostShell>
  );
}
