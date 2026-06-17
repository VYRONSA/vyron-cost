import { AlertTriangle, Gauge, Store, TrendingDown } from "lucide-react";
import BranchIntelligenceClient from "@/components/BranchIntelligenceClient";
import EnterpriseMetricCard from "@/components/EnterpriseMetricCard";
import VyronCostShell from "@/components/VyronCostShell";
import { formatMoney } from "@/lib/vyron-cost-data";
import { getBranchRiskFindings } from "@/lib/vyron-leakage-intelligence-data";

export default async function BranchIntelligencePage() {
  const rows = await getBranchRiskFindings();

  const critical = rows.filter((row) => String(row.risk_level || "").toLowerCase().includes("critical"));
  const totalSpend = rows.reduce((sum, row) => sum + Number(row.spend_total || 0), 0);
  const totalWastage = rows.reduce((sum, row) => sum + Number(row.wastage_estimate || 0), 0);
  const avgLeakage = rows.length ? rows.reduce((sum, row) => sum + Number(row.leakage_score || 0), 0) / rows.length : 0;

  return (
    <VyronCostShell hidePageHeader title="Branch Overspending Intelligence" subtitle="BRANCH SPEND / WASTAGE / GP EROSION / LEAKAGE SCORE">
      <section className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <EnterpriseMetricCard title="Branches" value={String(rows.length)} note="Under intelligence review" icon={Store} dark />
        <EnterpriseMetricCard title="Critical" value={String(critical.length)} note="Immediate action required" icon={AlertTriangle} />
        <EnterpriseMetricCard title="Total Spend" value={formatMoney(totalSpend)} note="Combined branch spend" icon={TrendingDown} />
        <EnterpriseMetricCard title="Avg Leakage" value={avgLeakage.toFixed(1)} note={`Wastage ${formatMoney(totalWastage)}`} icon={Gauge} />
      </section>

      <BranchIntelligenceClient rows={rows} />
    </VyronCostShell>
  );
}
