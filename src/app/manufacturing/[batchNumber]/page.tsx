import BackButton from "@/components/vyron-cost/BackButton";
import DeleteConfirmModal from "@/components/vyron-cost/DeleteConfirmModal";
import ModulePageShell from "@/components/vyron-cost/ModulePageShell";
import StatusPill from "@/components/vyron-cost/StatusPill";
import { formatCurrency, formatNumber } from "@/lib/vyron-cost/stock-engine";
import { getBatchCost, manufacturingBatches } from "@/lib/vyron-cost/manufacturing-data";

export default function ManufacturingBatchDetailPage({ params }: { params: { batchNumber: string } }) {
  const batch = manufacturingBatches.find((item) => item.batchNumber === decodeURIComponent(params.batchNumber)) ?? manufacturingBatches[0];
  const cost = getBatchCost(batch);

  return (
    <ModulePageShell eyebrow="Manufacturing Batch" title={batch.batchNumber} subtitle={`${batch.productName} • ${batch.bomName}`} actions={<><BackButton /><DeleteConfirmModal itemName={batch.batchNumber} itemType="manufacturing batch" onConfirm={() => undefined} /></>}>
      <section className="grid gap-4 md:grid-cols-5">
        <div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Status</p><div className="mt-3"><StatusPill status={batch.status} /></div></div>
        <div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Produced</p><p className="mt-2 text-3xl font-black">{formatNumber(batch.actualQuantityProduced)}</p></div>
        <div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Batch cost</p><p className="mt-2 text-3xl font-black">{formatCurrency(cost.totalCost)}</p></div>
        <div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Cost / unit</p><p className="mt-2 text-3xl font-black">{formatCurrency(cost.costPerUnit)}</p></div>
        <div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Variance</p><p className="mt-2 text-3xl font-black">{formatCurrency(cost.variance)}</p></div>
      </section>
      <section className="mt-6 rounded-[30px] bg-white/90 p-6 shadow-xl shadow-violet-100"><h2 className="text-xl font-black">Materials consumed</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-3">Item</th><th>Type</th><th className="text-right">Expected</th><th className="text-right">Actual</th><th className="text-right">Unit Cost</th><th className="text-right">Value</th></tr></thead><tbody className="divide-y divide-slate-100">{batch.lines.map((line) => <tr key={line.itemId}><td className="py-4 font-bold">{line.itemName}</td><td>{line.itemType}</td><td className="text-right">{line.expectedQuantity} {line.unit}</td><td className="text-right">{line.actualQuantity} {line.unit}</td><td className="text-right">{formatCurrency(line.unitCost)}</td><td className="text-right">{formatCurrency(line.actualQuantity * line.unitCost)}</td></tr>)}</tbody></table></div></section>
    </ModulePageShell>
  );
}
