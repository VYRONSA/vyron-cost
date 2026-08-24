import VyronCostAiShell from "@/components/VyronCostAiShell";
import CustomerPortalAccessClient from "@/components/vyron-order/CustomerPortalAccessClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Customer Portal Access"
      subtitle="WHO CAN ORDER THROUGH VYRON ORDER, AND WHAT THEY SIGN IN WITH."
    >
      <CustomerPortalAccessClient />
    </VyronCostAiShell>
  );
}
