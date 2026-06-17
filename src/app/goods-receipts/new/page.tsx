import GoodsReceiptFormClient from "@/components/GoodsReceiptFormClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default async function NewGoodsReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  const params = await searchParams;
  return (
    <VyronCostAiShell hidePageHeader title="New GRN" subtitle="Full, partial, damaged or rejected receipts">
      <GoodsReceiptFormClient initialPoId={params.po} />
    </VyronCostAiShell>
  );
}
