import VyronCostAiShell from "@/components/VyronCostAiShell";
import OrderCentreClient from "@/components/vyron-order/OrderCentreClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <VyronCostAiShell
      hidePageHeader
      wide
      title="VYRON Order Centre"
      subtitle="CUSTOMER ORDERS FROM VYRON ORDER, IN THE EXISTING SALES-ORDER ENGINE."
    >
      <OrderCentreClient />
    </VyronCostAiShell>
  );
}
