import VyronCostPageShell from "@/components/vyron-cost/shared/VyronCostPageShell";
import CustomerIntelligenceClient from "@/components/vyron-cost/customers/CustomerIntelligenceClient";

export default function Page() {
  return (
    <VyronCostPageShell
      title="Customer Intelligence"
      subtitle="Customer revenue, COGS, gross profit, product mix and AI sales recommendations."
      backHref="/dashboard"
    >
      <CustomerIntelligenceClient />
    </VyronCostPageShell>
  );
}
