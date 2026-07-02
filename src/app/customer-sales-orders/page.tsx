import VyronCostAiShell from "@/components/VyronCostAiShell";
import CustomerSalesOrdersClient from "@/components/vyron-cost/customers/CustomerSalesOrdersClient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; create?: string }>;
}) {
  const params = await searchParams;
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Sales Orders"
      subtitle="COMMERCIAL WORKFLOW BEFORE INVOICING: APPROVE, ALLOCATE, PICK, DISPATCH, CONVERT."
    >
      <CustomerSalesOrdersClient
        initialCustomerId={params.customerId || null}
        initialCreateOpen={params.create === "1"}
      />
    </VyronCostAiShell>
  );
}
