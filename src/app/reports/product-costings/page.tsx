import ProductCostingReportClient from "@/components/reports/ProductCostingReportClient";
import MetricCard from "@/components/MetricCard";
import VyronCostShell from "@/components/VyronCostShell";
import { Boxes, Layers3, PackageCheck, PackageSearch } from "lucide-react";
import { formatMoney, getProductCostLines } from "@/lib/vyron-cost-data";

export default async function ProductCostingReportPage() {
  const lines = await getProductCostLines();
  const total = lines.reduce((sum, line) => sum + Number(line.line_cost || line.line_cost_imported || 0), 0);
  const ingredients = lines.filter((line) => line.line_type === "Ingredient").length;
  const packaging = lines.filter((line) => line.line_type === "Packaging").length;

  return (
    <VyronCostShell hidePageHeader title="Product Costing Lines Report" subtitle="Dedicated BOM and costing-line report.">
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <MetricCard title="Cost Lines" value={String(lines.length)} note="Total BOM lines" icon={Layers3} />
        <MetricCard title="Ingredient Lines" value={String(ingredients)} note="Ingredient records" icon={Boxes} />
        <MetricCard title="Packaging Lines" value={String(packaging)} note="Packaging records" icon={PackageCheck} />
        <MetricCard title="Line Cost Value" value={formatMoney(total)} note="Total imported line value" icon={PackageSearch} dark />
      </section>
      <ProductCostingReportClient lines={lines} />
    </VyronCostShell>
  );
}
