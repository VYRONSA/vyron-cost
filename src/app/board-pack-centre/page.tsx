import BoardPackGeneratorClient from "@/components/BoardPackGeneratorClient";
import VyronCostShell from "@/components/VyronCostShell";
import { buildBoardPackData } from "@/lib/vyron-finance-intelligence";

export default async function BoardPackCentrePage() {
  const pack = await buildBoardPackData("Current month to date");

  return (
    <VyronCostShell
      title="Board Pack Centre"
      subtitle="EXECUTIVE BOARD PACK · PDF · EXCEL · CSV · INTERNATIONAL CLIENT STANDARD"
    >
      <BoardPackGeneratorClient pack={pack} />
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          ["Procurement", `${pack.procurement.openPos} open POs · ${pack.procurement.poVariances} variances`],
          ["Inventory", money(pack.inventory.inventoryValue) + ` · ${pack.inventory.lowStock} low stock`],
          ["Recovery", money(pack.recovery.potentialRecovery) + " potential"],
        ].map(([title, note]) => (
          <div key={title} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase text-slate-400">{title}</div>
            <div className="mt-2 text-sm font-bold text-slate-800">{note}</div>
          </div>
        ))}
      </section>
    </VyronCostShell>
  );
}

function money(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
