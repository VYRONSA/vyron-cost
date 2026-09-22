import VyronCostAiShell from "@/components/VyronCostAiShell";
import OrderIntakeCreateClient from "@/components/vyron-order-engine/OrderIntakeCreateClient";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function NewOrderIntakePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  await requireWorkspacePage("sales_orders.create");
  const params = await searchParams;
  return (
    <VyronCostAiShell hidePageHeader title="New order" subtitle="RECORD A CUSTOMER ORDER EXACTLY AS RECEIVED.">
      <OrderIntakeCreateClient initialMode={params.mode === "csv" ? "csv" : "manual"} />
    </VyronCostAiShell>
  );
}
