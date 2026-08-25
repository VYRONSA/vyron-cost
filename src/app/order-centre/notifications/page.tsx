import VyronCostAiShell from "@/components/VyronCostAiShell";
import OrderNotificationSettingsClient from "@/components/vyron-order/OrderNotificationSettingsClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Order Notifications"
      subtitle="WHO HEARS ABOUT CUSTOMER ORDERS, AND HOW."
    >
      <OrderNotificationSettingsClient />
    </VyronCostAiShell>
  );
}
