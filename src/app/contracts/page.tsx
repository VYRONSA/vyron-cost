import ContractsClient from "@/components/enterprise/ContractsClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getSupplierContracts } from "@/lib/vyron-enterprise-platform";

export default async function ContractsPage() {
  const contracts = await getSupplierContracts();
  return (
    <VyronCostShell title="Contract Management" subtitle="PRICING · DISCOUNTS · EXPIRY · RENEWAL ALERTS">
      <ContractsClient contracts={contracts} />
    </VyronCostShell>
  );
}
