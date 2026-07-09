import BackButton from "@/components/vyron-cost/BackButton";
import ModulePageShell from "@/components/vyron-cost/ModulePageShell";
import ReportExportActions from "@/components/reports/ReportExportActions";
import { formatCurrency, formatNumber } from "@/lib/vyron-cost/stock-engine";
import { demoStockMovements, stockBalances } from "@/lib/vyron-cost/manufacturing-data";

export default function InventoryStockReportsPage() {
  const movements = demoStockMovements();
  const totalValue = stockBalances.reduce((sum, item) => sum + item.totalValue, 0);
  return (
    <ModulePageShell eyebrow="Reports Centre" title="Complete Stock Valuation" subtitle="Raw materials, packaging, finished goods and complete stock movement ledger." actions={<><BackButton /><ReportExportActions reportKey="inventory-stock" /></>}>
      <section className="grid gap-4 md:grid-cols-4"><div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Stock value</p><p className="mt-2 text-3xl font-black">{formatCurrency(totalValue)}</p></div><div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Stock items</p><p className="mt-2 text-3xl font-black">{stockBalances.length}</p></div><div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Movements</p><p className="mt-2 text-3xl font-black">{movements.length}</p></div><div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Finished goods</p><p className="mt-2 text-3xl font-black">{stockBalances.filter((i) => i.itemType === "finished_good").length}</p></div></section>
      <section className="mt-6 overflow-hidden rounded-[30px] bg-white/90 shadow-xl"><div className="border-b border-slate-100 p-5"><h2 className="text-xl font-black">Stock valuation</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-4">Item</th><th className="px-5 py-4">Type</th><th className="px-5 py-4 text-right">Qty on hand</th><th className="px-5 py-4 text-right">Unit cost</th><th className="px-5 py-4 text-right">Value</th><th className="px-5 py-4">Last movement</th></tr></thead><tbody className="divide-y divide-slate-100">{stockBalances.map((item) => <tr key={item.itemId}><td className="px-5 py-4 font-black">{item.itemName}</td><td className="px-5 py-4">{item.itemType}</td><td className="px-5 py-4 text-right">{formatNumber(item.quantityOnHand, 2)}</td><td className="px-5 py-4 text-right">{formatCurrency(item.unitCost)}</td><td className="px-5 py-4 text-right">{formatCurrency(item.totalValue)}</td><td className="px-5 py-4">{item.lastMovementDate}</td></tr>)}</tbody></table></div></section>
    </ModulePageShell>
  );
}
