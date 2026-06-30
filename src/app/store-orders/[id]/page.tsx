import VyronCostAiShell from "@/components/VyronCostAiShell";
import StoreOrderEditorClient from "@/components/vyron-cost/store-ordering/StoreOrderEditorClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function StoreOrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <VyronCostAiShell hidePageHeader title="Store Order" subtitle="View and manage store order workflow.">
      <StoreOrderEditorClient orderId={id} />
    </VyronCostAiShell>
  );
}
