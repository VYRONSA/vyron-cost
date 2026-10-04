import VyronCostAiShell from "@/components/VyronCostAiShell";
import OnlineStoreSalesClient from "@/components/vyron-cost/integrations/OnlineStoreSalesClient";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function OnlineStoreSalesPage() {
  await requireWorkspacePage("invoices.view");
  return (
    <VyronCostAiShell hidePageHeader title="Online Store Sales" subtitle="SHOPIFY AND WOOCOMMERCE SALES, RECORDED AUTOMATICALLY.">
      <OnlineStoreSalesClient />
    </VyronCostAiShell>
  );
}
