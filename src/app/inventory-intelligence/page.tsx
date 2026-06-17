import Link from "next/link";
import InventoryIntelligenceDashboardClient from "@/components/InventoryIntelligenceDashboardClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { VyronPremiumSectionHeading } from "@/components/vyron-premium/VyronPremiumSprint";

export default function Page() {
  return (
    <VyronCostAiShell hidePageHeader title="Inventory Intelligence"
      subtitle="RAW MATERIALS, FINISHED GOODS, INVENTORY TURNS, LOW STOCK AND NEGATIVE STOCK RISK ACROSS THE FULL PROCUREMENT TO SALES WORKFLOW."
    >
      <InventoryIntelligenceDashboardClient />

      <section className="mt-8 rounded-[2rem] border border-white/70 bg-white/90 p-8 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <VyronPremiumSectionHeading
          eyebrow="Quick navigation"
          title="Inventory Control Links"
          subtitle="Open the operational stock pages without leaving the VYRON COST shell."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Link href="/inventory" className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 text-sm font-black text-violet-800 transition hover:border-violet-200 hover:shadow-md">
            Inventory Dashboard
          </Link>
          <Link href="/manufacturing/finished-goods" className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 text-sm font-black text-violet-800 transition hover:border-violet-200 hover:shadow-md">
            Finished Goods
          </Link>
          <Link href="/inventory/counts" className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 text-sm font-black text-violet-800 transition hover:border-violet-200 hover:shadow-md">
            Stock Counts
          </Link>
          <Link href="/inventory/ledger" className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 text-sm font-black text-violet-800 transition hover:border-violet-200 hover:shadow-md">
            Stock Ledger
          </Link>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
