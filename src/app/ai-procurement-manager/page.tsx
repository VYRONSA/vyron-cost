import AiProcurementManagerClient from "@/components/AiProcurementManagerClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import {
  getProcurementExecutiveStats,
  getProcurementRecommendations,
} from "@/lib/vyron-procurement-ai-data";

export default async function AiProcurementManagerPage() {
  const [recommendations, stats] = await Promise.all([
    getProcurementRecommendations(),
    getProcurementExecutiveStats(),
  ]);

  return (
    <VyronCostAiShell hidePageHeader title="AI Procurement Manager"
      subtitle="See It. Understand It. Fix It."
    >
      <AiProcurementManagerClient recommendations={recommendations} stats={stats} />
    </VyronCostAiShell>
  );
}
