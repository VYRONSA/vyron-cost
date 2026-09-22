import VyronCostAiShell from "@/components/VyronCostAiShell";
import OrderIntakeDetailClient from "@/components/vyron-order-engine/OrderIntakeDetailClient";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function OrderIntakeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ duplicate?: string }>;
}) {
  await requireWorkspacePage("sales_orders.view");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <VyronCostAiShell hidePageHeader title="Order review" subtitle="VALIDATION, EXCEPTIONS AND APPROVAL.">
      <OrderIntakeDetailClient id={id} duplicate={query.duplicate === "1"} />
    </VyronCostAiShell>
  );
}
