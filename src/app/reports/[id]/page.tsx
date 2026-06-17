import ReportDetailClient from "@/components/ReportDetailClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <VyronCostAiShell hidePageHeader title="Report Detail" subtitle="VIEW · PRINT · EXPORT CSV">
      <ReportDetailClient reportId={id} />
    </VyronCostAiShell>
  );
}
