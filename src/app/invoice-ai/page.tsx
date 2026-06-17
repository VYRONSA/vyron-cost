import { BrainCircuit, FileText, MailCheck, TrendingUp } from "lucide-react";
import EnterpriseMetricCard from "@/components/EnterpriseMetricCard";
import InvoiceAiCentreClient from "@/components/InvoiceAiCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { formatMoney } from "@/lib/vyron-cost-data";
import {
  getEnterpriseInvoiceHeaders,
  getEnterpriseInvoiceLines,
  getEnterprisePriceMovements,
} from "@/lib/vyron-enterprise-data";

export default async function InvoiceAiPage() {
  const [invoices, lines, movements] = await Promise.all([
    getEnterpriseInvoiceHeaders(),
    getEnterpriseInvoiceLines(),
    getEnterprisePriceMovements(),
  ]);

  const invoiceValue = invoices.reduce((sum, invoice) => sum + Number(invoice.invoice_total || 0), 0);
  const avgConfidence = lines.length
    ? lines.reduce((sum, line) => sum + Number(line.ai_confidence || 0), 0) / lines.length
    : 0;

  return (
    <VyronCostShell hidePageHeader title="Invoice AI"
      subtitle="Supplier invoice ingestion, PDF extraction, ingredient matching, price movement detection and approval workflow foundation."
    >
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <EnterpriseMetricCard title="Invoices" value={String(invoices.length)} note="Invoices in AI queue." icon={MailCheck} />
        <EnterpriseMetricCard title="Invoice Value" value={formatMoney(invoiceValue)} note="Total invoice value visible." icon={FileText} />
        <EnterpriseMetricCard title="AI Confidence" value={`${avgConfidence.toFixed(0)}%`} note="Average line-match confidence." icon={BrainCircuit} dark />
        <EnterpriseMetricCard title="Price Movements" value={String(movements.length)} note="Supplier price changes detected." icon={TrendingUp} />
      </section>

      <InvoiceAiCentreClient invoices={invoices} lines={lines} />
    </VyronCostShell>
  );
}
