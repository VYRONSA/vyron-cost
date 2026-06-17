import ProcurementRecommendationDetailClient from "@/components/ProcurementRecommendationDetailClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getProcurementRecommendationByKey } from "@/lib/vyron-procurement-ai-data";
import { notFound } from "next/navigation";

export default async function ProcurementRecommendationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recommendation = await getProcurementRecommendationByKey(decodeURIComponent(id));
  if (!recommendation) notFound();

  return (
    <VyronCostAiShell hidePageHeader title="Recommendation detail" subtitle={recommendation.category}>
      <ProcurementRecommendationDetailClient recommendation={recommendation} />
    </VyronCostAiShell>
  );
}
