import InvoiceForensicsClient from "@/components/InvoiceForensicsClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getInvoiceRiskFindings, getProcurementRiskFindings } from "@/lib/vyron-leakage-intelligence-data";

export default async function ProcurementIntelligencePage() {
  const [invoiceRisks, procurementRisks] = await Promise.all([
    getInvoiceRiskFindings(),
    getProcurementRiskFindings(),
  ]);

  return (
    <VyronCostAiShell hidePageHeader title="Procurement Intelligence"
      subtitle="SUPPLIER RISK · PRICE VARIANCE · DUPLICATE INVOICES · PO/GRN MATCHING"
    >
      <section className="grid gap-6">
        <div className="rounded-[2rem] border border-violet-100 bg-violet-50 p-5 text-sm font-semibold text-slate-600">
          Procurement Intelligence focuses on supplier risks, invoice variances, duplicate patterns and PO/GRN/invoice matching.
          Use <strong>Document Intelligence</strong> for upload, extract, review, approve and archive.
        </div>
        <InvoiceForensicsClient rows={invoiceRisks} />
        <div className="rounded-[2rem] border border-violet-100 bg-white p-6">
          <h2 className="text-lg font-black text-slate-950">Procurement risk alerts</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="bg-violet-800 text-xs font-black uppercase tracking-[0.14em] text-violet-100">
                <tr>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {procurementRisks.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-bold">{row.supplier_name}</td>
                    <td className="px-4 py-3">{row.category_name}</td>
                    <td className="px-4 py-3">{row.risk_type}</td>
                    <td className="px-4 py-3">{row.action_required}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
