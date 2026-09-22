import VyronCostAiShell from "@/components/VyronCostAiShell";
import OrderCentreClient from "@/components/vyron-order/OrderCentreClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <VyronCostAiShell
      hidePageHeader
      wide
      title="VOLORA Order Centre"
      subtitle="CUSTOMER ORDERS FROM VOLORA Order, IN THE EXISTING SALES-ORDER ENGINE."
    >
      <OrderCentreClient />
    </VyronCostAiShell>
  );
}
