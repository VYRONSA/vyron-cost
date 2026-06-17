import { AlertTriangle, PackageSearch, ShieldAlert, TrendingUp } from "lucide-react";
import EnterpriseMetricCard from "@/components/EnterpriseMetricCard";
import ProductIntelligenceClient from "@/components/ProductIntelligenceClient";
import VyronCostShell from "@/components/VyronCostShell";
import { formatMoney } from "@/lib/vyron-cost-data";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";
import { shouldUseWorkspaceDemoData } from "@/lib/vyron-workspace-server";

export default async function ProductsIntelligencePage() {
  const clientDemo = await shouldUseWorkspaceDemoData();
  const rows = await getProductIntelligence();

  const risk = rows.filter((row) => ["Critical", "High"].includes(String(row.risk_level)));
  const totalRisk = rows.reduce((sum, row) => sum + Number(row.monthly_risk_value || 0), 0);
  const avgGap = rows.length
    ? rows.reduce((sum, row) => sum + Math.max(Number(row.gp_gap || 0), 0), 0) / rows.length
    : 0;

  return (
    <VyronCostShell hidePageHeader title={clientDemo ? "Handcrafted Product Intelligence" : "Product Intelligence"}
      subtitle={clientDemo ? "IMPORTED PRODUCTS · GP RISK · SUGGESTED PRICE" : "GP RISK / PRICE ACTION / MARGIN CONTROL"}
    >
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <EnterpriseMetricCard title="Products" value={String(rows.length)} note="Analysed products" icon={PackageSearch} />
        <EnterpriseMetricCard title="High Risk" value={String(risk.length)} note="Needs price action" icon={AlertTriangle} dark />
        <EnterpriseMetricCard title="Risk Value" value={formatMoney(totalRisk)} note="Monthly exposure" icon={ShieldAlert} />
        <EnterpriseMetricCard title="Avg GP Gap" value={`${avgGap.toFixed(1)}%`} note="Average shortfall" icon={TrendingUp} />
      </section>

      <ProductIntelligenceClient rows={rows} />
    </VyronCostShell>
  );
}
