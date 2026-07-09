import BackButton from "@/components/vyron-cost/BackButton";
import ModulePageShell from "@/components/vyron-cost/ModulePageShell";
import ReportExportActions from "@/components/reports/ReportExportActions";
import { formatCurrency, formatNumber } from "@/lib/vyron-cost/stock-engine";
import { getBatchCost, manufacturingBatches } from "@/lib/vyron-cost/manufacturing-data";

export default function ManufacturingReportsPage() {
  return (
    <ModulePageShell eyebrow="Reports Centre" title="Manufacturing Reports" subtitle="Batch history, cost variances, wastage and finished goods production reports." actions={<><BackButton /><ReportExportActions reportKey="manufacturing" /></>}>
      <section className="grid gap-4 md:grid-cols-3">{["Manufacturing Batch History", "Actual vs Expected Cost", "Manufacturing Wastage"].map((title) => <div key={title} className="rounded-[28px] bg-white/90 p-5 shadow-lg"><h2 className="font-black">{title}</h2><p className="mt-2 text-sm text-slate-500">Open, printable and export-ready report view.</p></div>)}</section>
      <section className="mt-6 overflow-hidden rounded-[30px] bg-white/90 shadow-xl"><div className="border-b border-slate-100 p-5"><h2 className="text-xl font-black">Batch variance report</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-4">Batch</th><th className="px-5 py-4">Product</th><th className="px-5 py-4 text-right">Produced</th><th className="px-5 py-4 text-right">Expected Cost</th><th className="px-5 py-4 text-right">Actual Cost</th><th className="px-5 py-4 text-right">Variance</th></tr></thead><tbody className="divide-y divide-slate-100">{manufacturingBatches.map((batch) => { const cost = getBatchCost(batch); return <tr key={batch.batchNumber}><td className="px-5 py-4 font-black">{batch.batchNumber}</td><td className="px-5 py-4">{batch.productName}</td><td className="px-5 py-4 text-right">{formatNumber(batch.actualQuantityProduced)}</td><td className="px-5 py-4 text-right">{formatCurrency(cost.expectedCost)}</td><td className="px-5 py-4 text-right">{formatCurrency(cost.totalCost)}</td><td className="px-5 py-4 text-right">{formatCurrency(cost.variance)}</td></tr>; })}</tbody></table></div></section>
    </ModulePageShell>
  );
}
