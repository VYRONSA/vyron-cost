import {
  AlertTriangle,
  Calendar,
  FileWarning,
  Package,
  Percent,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import EnterpriseMetricCard from "@/components/EnterpriseMetricCard";
import { formatMoney } from "@/lib/vyron-cost-data";
import { LeakageKpis } from "@/lib/vyron-financial-command-data";

export default function LeakageKpiGrid({ kpis, showAnnual = false }: { kpis: LeakageKpis; showAnnual?: boolean }) {
  return (
    <section className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
      <Link href="/financial-leakage" className="block">
        <EnterpriseMetricCard
          title="Estimated Monthly Leakage"
          value={formatMoney(kpis.estimatedMonthlyLeakage)}
          note="Total silent loss exposure"
          icon={Wallet}
          dark
        />
      </Link>
      {showAnnual && (
        <Link href="/recovery-opportunities" className="block">
          <EnterpriseMetricCard
            title="Estimated Annual Leakage"
            value={formatMoney(kpis.estimatedAnnualLeakage)}
            note={`Recoverable ${formatMoney(kpis.recoverableAnnual)} / year`}
            icon={Calendar}
            dark
          />
        </Link>
      )}
      <Link href="/product-profitability" className="block">
        <EnterpriseMetricCard
          title="Products Below Target GP"
          value={formatMoney(kpis.productsBelowGp)}
          note="Margin pressure on SKUs"
          icon={Percent}
        />
      </Link>
      <Link href="/supplier-inflation" className="block">
        <EnterpriseMetricCard
          title="Supplier Inflation Exposure"
          value={formatMoney(kpis.supplierInflationExposure)}
          note="Imported material movement"
          icon={TrendingUp}
        />
      </Link>
      <Link href="/procurement-risk" className="block">
        <EnterpriseMetricCard
          title="Procurement Risks"
          value={formatMoney(kpis.procurementAnomalies)}
          note="Packaging & buying anomalies"
          icon={ShieldAlert}
        />
      </Link>
      <Link href="/production-intelligence" className="block">
        <EnterpriseMetricCard
          title="Wastage Exposure"
          value={formatMoney(kpis.wastageLosses)}
          note="Yield & shrinkage leakage"
          icon={Package}
        />
      </Link>
      <Link href="/invoice-forensics" className="block">
        <EnterpriseMetricCard
          title="Duplicate Invoice Risks"
          value={formatMoney(kpis.duplicateInvoiceRisks)}
          note="Possible double payment"
          icon={FileWarning}
          dark
        />
      </Link>
      {!showAnnual && (
        <Link href="/recovery-opportunities" className="block md:col-span-2">
          <EnterpriseMetricCard
            title="Recovery Potential"
            value={formatMoney(kpis.recoverableAnnual)}
            note="Annual recoverable value"
            icon={AlertTriangle}
            dark
          />
        </Link>
      )}
    </section>
  );
}
