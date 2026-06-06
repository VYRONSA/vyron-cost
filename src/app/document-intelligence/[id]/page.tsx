import DocumentReviewWorkspace from "@/components/DocumentReviewWorkspace";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default async function DocumentReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <VyronCostAiShell title="Invoice Review" subtitle="EXTRACT · MATCH · APPROVE" hidePageHeader fullWidthMain>
      <DocumentReviewWorkspace documentId={id} embedded />
    </VyronCostAiShell>
  );
}
