import VyronCostAiShell from "@/components/VyronCostAiShell";
import OrderCentreDetailClient from "@/components/vyron-order/OrderCentreDetailClient";

export const dynamic = "force-dynamic";

/**
 * One order, for staff.
 *
 * The shell enforces staff authentication, so an unauthenticated visitor
 * following a notification link is sent to sign in and returns here — the order
 * is never exposed on a public URL.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <VyronCostAiShell hidePageHeader wide title="Order" subtitle="VYRON ORDER CENTRE">
      <OrderCentreDetailClient orderId={id} />
    </VyronCostAiShell>
  );
}
