import VyronCostAiShell from "@/components/VyronCostAiShell";
import OrderRulesClient from "@/components/vyron-order-engine/OrderRulesClient";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";
import { sessionHasPermission } from "@/lib/vyron-workspace-permissions";

export default async function OrderRulesPage() {
  const { session } = await requireWorkspacePage("sales_orders.view");
  return (
    <VyronCostAiShell hidePageHeader title="Order rules & mappings" subtitle="OPTIONAL CUSTOMER ORDERING RULES AND REMEMBERED MAPPINGS.">
      <OrderRulesClient canManage={sessionHasPermission(session, "sales_orders.approve")} />
    </VyronCostAiShell>
  );
}
