import ProductMarginReportClient from "@/components/reports/ProductMarginReportClient";
import MetricCard from "@/components/MetricCard";
import VyronCostShell from "@/components/VyronCostShell";
import { PackageSearch, Percent, ShieldAlert, Tag } from "lucide-react";
import { calculateGpPercent, calculateSuggestedPrice, formatMoney, getProducts } from "@/lib/vyron-cost-data";

export default async function ProductMarginReportPage() {
  const products = await getProducts();
  const riskProducts = products.filter((product) => calculateGpPercent(Number(product.selling_price), Number(product.total_cost)) < Number(product.target_gp));
  const avgGp = products.length ? products.reduce((sum, product) => sum + calculateGpPercent(Number(product.selling_price), Number(product.total_cost)), 0) / products.length : 0;
  const protectedRevenue = riskProducts.reduce((sum, product) => {
    const suggested = calculateSuggestedPrice(Number(product.total_cost), Number(product.target_gp));
    return sum + Math.max(suggested - Number(product.selling_price), 0) * 1200;
  }, 0);

  return (
    <VyronCostShell title="Product Margin Report" subtitle="Dedicated product GP, margin and price review report.">
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <MetricCard title="Products" value={String(products.length)} note="Total product records" icon={PackageSearch} />
        <MetricCard title="Average GP" value={`${avgGp.toFixed(1)}%`} note="Current average margin" icon={Percent} />
        <MetricCard title="Price Reviews" value={String(riskProducts.length)} note="Below target GP" icon={ShieldAlert} />
        <MetricCard title="Opportunity" value={formatMoney(protectedRevenue)} note="Monthly protection estimate" icon={Tag} dark />
      </section>
      <ProductMarginReportClient products={products} />
    </VyronCostShell>
  );
}
