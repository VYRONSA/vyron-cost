import VyronCostAiShell from "@/components/VyronCostAiShell";
import CustomerStatementsClient from "@/components/vyron-cost/customers/CustomerStatementsClient";

export default function Page() {
  return (
    <VyronCostAiShell title="Customer Statements" subtitle="OUTSTANDING BALANCE, INVOICE HISTORY, PRINT AND EMAIL STATEMENTS.">
      <CustomerStatementsClient />
    </VyronCostAiShell>
  );
}
