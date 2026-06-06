import {
  AlertTriangle,
  CheckSquare,
  FileWarning,
  Percent,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import EnterpriseMetricCard from "@/components/EnterpriseMetricCard";
import { formatMoney } from "@/lib/vyron-cost-data";
import { LeakageKpis } from "@/lib/vyron-financial-command-data";

export default function DashboardKpiGrid({ kpis }: { kpis: LeakageKpis }) {
  return (
    <section className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <Link href="/financial-leakage" className="block">
        <EnterpriseMetricCard title="Money At Risk" value={formatMoney(kpis.moneyAtRisk)} note="Monthly exposure" icon={ShieldAlert} dark />
      </Link>
      <Link href="/recovery-opportunities" className="block">
        <EnterpriseMetricCard
          title="Recoverable Value"
          value={formatMoney(kpis.recoverableAnnual)}
          note="Annual recovery potential"
          icon={Wallet}
        />
      </Link>
      <Link href="/product-profitability" className="block">
        <EnterpriseMetricCard title="Products Below GP" value={formatMoney(kpis.productsBelowGp)} note="Margin action required" icon={Percent} />
      </Link>
      <Link href="/supplier-inflation" className="block">
        <EnterpriseMetricCard title="Supplier Inflation Exposure" value={formatMoney(kpis.supplierInflationExposure)} note="Price movement impact" icon={TrendingUp} />
      </Link>
      <Link href="/action-centre" className="block">
        <EnterpriseMetricCard title="Pending Actions" value={String(kpis.pendingActions)} note="Management decisions" icon={CheckSquare} />
      </Link>
      <Link href="/procurement-risk" className="block">
        <EnterpriseMetricCard title="Procurement Risk" value={formatMoney(kpis.procurementAnomalies)} note="Spend & packaging risk" icon={AlertTriangle} />
      </Link>
      <Link href="/financial-leakage" className="block md:col-span-2 xl:col-span-1">
        <EnterpriseMetricCard
          title="Monthly Leakage"
          value={formatMoney(kpis.estimatedMonthlyLeakage)}
          note="Estimated silent loss"
          icon={FileWarning}
        />
      </Link>
    </section>
  );
}
