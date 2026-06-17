import { Building2, MapPin, Store, Users } from "lucide-react";
import BranchManagerClient from "@/components/BranchManagerClient";
import EnterpriseMetricCard from "@/components/EnterpriseMetricCard";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterpriseBranches, getEnterpriseCompanies } from "@/lib/vyron-enterprise-data";

export default async function BranchesPage() {
  const [branches, companies] = await Promise.all([
    getEnterpriseBranches(),
    getEnterpriseCompanies(),
  ]);

  const companyId = companies[0]?.id || "company-demo";
  const active = branches.filter((branch) => branch.is_active).length;

  return (
    <VyronCostShell hidePageHeader title="Branches"
      subtitle="Branch and location setup for future branch-level GP, wastage, sales mix and profitability intelligence."
    >
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <EnterpriseMetricCard title="Branches" value={String(branches.length)} note="Total branch records." icon={Store} />
        <EnterpriseMetricCard title="Active" value={String(active)} note="Currently active branches." icon={Building2} />
        <EnterpriseMetricCard title="Regions" value={String(new Set(branches.map((b) => b.region).filter(Boolean)).size)} note="Operating regions." icon={MapPin} />
        <EnterpriseMetricCard title="Managers" value="Next" note="Manager assignment comes next." icon={Users} dark />
      </section>

      <BranchManagerClient branches={branches} companyId={companyId} />
    </VyronCostShell>
  );
}
