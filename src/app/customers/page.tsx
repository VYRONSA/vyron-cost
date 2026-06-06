import VyronCostAiShell from "@/components/VyronCostAiShell";
import CustomersClient from "@/components/vyron-cost/customers/CustomersClient";

export default function Page() {
  return (
    <VyronCostAiShell
      title="Customers"
      subtitle="MANAGE CUSTOMERS, CONTACTS, INVOICE EMAILS AND SALES TERMS."
    >
      <CustomersClient />
    </VyronCostAiShell>
  );
}
