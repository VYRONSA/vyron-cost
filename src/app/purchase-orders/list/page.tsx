import ProcurementPoListClient from "@/components/ProcurementPoListClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default async function PurchaseOrdersListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  return (
    <VyronCostAiShell hidePageHeader title="Purchase Orders List" subtitle="Search and manage all purchase orders">
      <ProcurementPoListClient initialStatus={params.status || ""} />
    </VyronCostAiShell>
  );
}
