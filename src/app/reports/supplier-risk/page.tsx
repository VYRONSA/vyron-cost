import SupplierReportClient from "@/components/reports/SupplierReportClient";
import MetricCard from "@/components/MetricCard";
import VyronCostShell from "@/components/VyronCostShell";
import { Building2, MailCheck, ShieldAlert, TrendingUp } from "lucide-react";
import { getSuppliers, statusTone } from "@/lib/vyron-cost-data";

export default async function SupplierRiskReportPage() {
  const suppliers = await getSuppliers();
  const highRisk = suppliers.filter((supplier) => statusTone(supplier.risk_status) === "red").length;
  const withInvoiceEmail = suppliers.filter((supplier) => supplier.invoice_email).length;
  const avgMovement = suppliers.length ? suppliers.reduce((sum, supplier) => sum + Number(supplier.last_price_movement || 0), 0) / suppliers.length : 0;

  return (
    <VyronCostShell hidePageHeader title="Supplier Risk Report" subtitle="Dedicated supplier risk, movement and invoice-routing report.">
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <MetricCard title="Suppliers" value={String(suppliers.length)} note="Total suppliers" icon={Building2} />
        <MetricCard title="High Risk" value={String(highRisk)} note="Needs procurement review" icon={ShieldAlert} />
        <MetricCard title="Invoice Ready" value={String(withInvoiceEmail)} note="With invoice email" icon={MailCheck} />
        <MetricCard title="Avg Movement" value={`${avgMovement.toFixed(1)}%`} note="Supplier price movement" icon={TrendingUp} dark />
      </section>
      <SupplierReportClient suppliers={suppliers} />
    </VyronCostShell>
  );
}
