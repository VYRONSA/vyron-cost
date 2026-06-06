import VyronCostPageShell from "@/components/vyron-cost/shared/VyronCostPageShell";
import FinishedGoodsClient from "@/components/vyron-cost/inventory/FinishedGoodsClient";

export default function Page() {
  return (
    <VyronCostPageShell
      title="Finished Goods"
      subtitle="Manufactured products ready for sale with cost, stock value, movement and AI recommendations."
      backHref="/dashboard"
    >
      <FinishedGoodsClient />
    </VyronCostPageShell>
  );
}
