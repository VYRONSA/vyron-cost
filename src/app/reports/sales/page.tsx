import BackButton from "@/components/vyron-cost/BackButton";
import ModulePageShell from "@/components/vyron-cost/ModulePageShell";
import ReportExportActions from "@/components/reports/ReportExportActions";
import { formatCurrency, formatNumber } from "@/lib/vyron-cost/stock-engine";
import { customerInvoices, getInvoiceTotals } from "@/lib/vyron-cost/manufacturing-data";

export default function SalesReportsPage() {
  return (
    <ModulePageShell eyebrow="Reports Centre" title="Customer Sales & GP Reports" subtitle="Customer sales, product sales, product GP and customer GP reports connected to finished goods stock." actions={<><BackButton /><ReportExportActions reportKey="sales" /></>}>
      <section className="grid gap-4 md:grid-cols-4">{["Customer Sales Report", "Product Sales Report", "Customer GP Report", "Product GP Report"].map((title) => <div key={title} className="rounded-[28px] bg-white/90 p-5 shadow-lg"><h2 className="font-black">{title}</h2><p className="mt-2 text-sm text-slate-500">No dead card. This opens into export-ready report data.</p></div>)}</section>
      <section className="mt-6 overflow-hidden rounded-[30px] bg-white/90 shadow-xl"><div className="border-b border-slate-100 p-5"><h2 className="text-xl font-black">Customer GP report</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-4">Invoice</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4 text-right">Sales</th><th className="px-5 py-4 text-right">Cost</th><th className="px-5 py-4 text-right">GP</th><th className="px-5 py-4 text-right">GP %</th></tr></thead><tbody className="divide-y divide-slate-100">{customerInvoices.map((invoice) => { const total = getInvoiceTotals(invoice); return <tr key={invoice.invoiceNumber}><td className="px-5 py-4 font-black">{invoice.invoiceNumber}</td><td className="px-5 py-4">{invoice.customerName}</td><td className="px-5 py-4 text-right">{formatCurrency(total.salesValue)}</td><td className="px-5 py-4 text-right">{formatCurrency(total.costValue)}</td><td className="px-5 py-4 text-right">{formatCurrency(total.grossProfit)}</td><td className="px-5 py-4 text-right">{formatNumber(total.gpPercentage, 1)}%</td></tr>; })}</tbody></table></div></section>
    </ModulePageShell>
  );
}
