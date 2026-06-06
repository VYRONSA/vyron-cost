import SupplierLearningClient from "@/components/SupplierLearningClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function SupplierLearningPage() {
  return (
    <VyronCostAiShell
      title="Supplier Learning"
      subtitle="REMEMBERED SUPPLIER LINE MAPPINGS FOR FASTER INVOICE REVIEW."
    >
      <SupplierLearningClient />
    </VyronCostAiShell>
  );
}
