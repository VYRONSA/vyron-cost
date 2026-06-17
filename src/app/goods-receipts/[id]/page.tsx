import GoodsReceiptDetailClient from "@/components/GoodsReceiptDetailClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default async function GoodsReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <VyronCostAiShell hidePageHeader title="Goods Received Note" subtitle="PO LINK · RECEIPT LINES · VARIANCE">
      <GoodsReceiptDetailClient grnId={id} />
    </VyronCostAiShell>
  );
}
