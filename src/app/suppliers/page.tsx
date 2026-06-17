import SupplierManagerClient from "@/components/SupplierManagerClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getSuppliers } from "@/lib/vyron-cost-core-data";

export default async function SuppliersPage() {
  const suppliers = await getSuppliers();
  return (
    <VyronCostAiShell hidePageHeader title="Suppliers" subtitle="Manage suppliers, risk, price movement and invoice contacts.">
      <SupplierManagerClient initialSuppliers={suppliers} />
    </VyronCostAiShell>
  );
}
