import VyronCostAiShell from "@/components/VyronCostAiShell";
import ExceptionCentreClient from "@/components/vyron-order-engine/ExceptionCentreClient";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function OrderExceptionCentrePage() {
  await requireWorkspacePage("sales_orders.view");
  return (
    <VyronCostAiShell hidePageHeader title="Exception Centre" subtitle="WHAT STOPS AN ORDER, WHY, AND WHAT TO DO.">
      <ExceptionCentreClient />
    </VyronCostAiShell>
  );
}
