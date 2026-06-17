import VyronCostAiShell from "@/components/VyronCostAiShell";
import CustomerInvoicesClient from "@/components/vyron-cost/customers/CustomerInvoicesClient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const { create } = await searchParams;
  return (
    <VyronCostAiShell hidePageHeader title="Customer Invoices"
      subtitle="SELL FINISHED GOODS TO CUSTOMERS, REDUCE STOCK, CALCULATE COGS, GP AND EMAIL INVOICES."
    >
      <CustomerInvoicesClient initialFormOpen={create === "1"} />
    </VyronCostAiShell>
  );
}
