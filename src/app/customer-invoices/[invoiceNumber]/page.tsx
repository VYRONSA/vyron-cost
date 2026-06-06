import BackButton from "@/components/vyron-cost/BackButton";
import DeleteConfirmModal from "@/components/vyron-cost/DeleteConfirmModal";
import ModulePageShell from "@/components/vyron-cost/ModulePageShell";
import StatusPill from "@/components/vyron-cost/StatusPill";
import { formatCurrency, formatNumber } from "@/lib/vyron-cost/stock-engine";
import { customerInvoices, getInvoiceTotals } from "@/lib/vyron-cost/manufacturing-data";

export default function CustomerInvoiceDetailPage({ params }: { params: { invoiceNumber: string } }) {
  const invoice = customerInvoices.find((item) => item.invoiceNumber === decodeURIComponent(params.invoiceNumber)) ?? customerInvoices[0];
  const totals = getInvoiceTotals(invoice);

  return (
    <ModulePageShell eyebrow="Customer Invoice" title={invoice.invoiceNumber} subtitle={`${invoice.customerName} • ${invoice.invoiceDate}`} actions={<><BackButton /><button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black">Print</button><button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black">Email</button><DeleteConfirmModal itemName={invoice.invoiceNumber} itemType="customer invoice" onConfirm={() => undefined} /></>}>
      <section className="grid gap-4 md:grid-cols-5"><div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Status</p><div className="mt-3"><StatusPill status={invoice.status} /></div></div><div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Sales</p><p className="mt-2 text-3xl font-black">{formatCurrency(totals.salesValue)}</p></div><div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">COGS</p><p className="mt-2 text-3xl font-black">{formatCurrency(totals.costValue)}</p></div><div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">GP</p><p className="mt-2 text-3xl font-black">{formatCurrency(totals.grossProfit)}</p></div><div className="rounded-[28px] bg-white/90 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">GP %</p><p className="mt-2 text-3xl font-black">{formatNumber(totals.gpPercentage)}%</p></div></section>
      <section className="mt-6 rounded-[30px] bg-white/90 p-6 shadow-xl shadow-violet-100"><h2 className="text-xl font-black">Invoice lines</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-3">Product</th><th className="text-right">Qty</th><th className="text-right">Selling Price</th><th className="text-right">Cost / Unit</th><th className="text-right">Line GP</th></tr></thead><tbody className="divide-y divide-slate-100">{invoice.lines.map((line) => <tr key={line.productId}><td className="py-4 font-bold">{line.productName}</td><td className="text-right">{line.quantity}</td><td className="text-right">{formatCurrency(line.sellingPrice)}</td><td className="text-right">{formatCurrency(line.costPerUnit)}</td><td className="text-right">{formatCurrency((line.sellingPrice - line.costPerUnit) * line.quantity)}</td></tr>)}</tbody></table></div></section>
    </ModulePageShell>
  );
}
