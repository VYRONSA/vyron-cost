import VyronCostAiShell from "@/components/VyronCostAiShell";
import OrderInboxClient from "@/components/vyron-order-engine/OrderInboxClient";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";
import { sessionHasPermission } from "@/lib/vyron-workspace-permissions";

const VIEWS = ["inbox", "approvals", "exceptions", "done", "all"] as const;

export default async function OrderInboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { session } = await requireWorkspacePage("sales_orders.view");
  const params = await searchParams;
  const view = VIEWS.find((v) => v === params.view) || "inbox";
  return (
    <VyronCostAiShell hidePageHeader title="Order Inbox" subtitle="RECEIVE, VALIDATE AND APPROVE CUSTOMER ORDERS BEFORE THEY BECOME SALES ORDERS.">
      <OrderInboxClient initialView={view} canCreate={sessionHasPermission(session, "sales_orders.create")} />
    </VyronCostAiShell>
  );
}
