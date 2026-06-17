import { Building2, CreditCard, Globe2, Percent } from "lucide-react";
import EnterpriseMetricCard from "@/components/EnterpriseMetricCard";
import StatusPill from "@/components/StatusPill";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterpriseCompanies } from "@/lib/vyron-enterprise-data";

export default async function CompaniesPage() {
  const companies = await getEnterpriseCompanies();

  return (
    <VyronCostShell hidePageHeader title="Companies"
      subtitle="Company setup and SaaS subscription foundation. Later this becomes onboarding, billing and multi-tenant control."
    >
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <EnterpriseMetricCard title="Companies" value={String(companies.length)} note="Tenant/company records." icon={Building2} />
        <EnterpriseMetricCard title="Plans" value={String(new Set(companies.map((c) => c.subscription_plan)).size)} note="Active subscription plans." icon={CreditCard} />
        <EnterpriseMetricCard title="Currency" value={companies[0]?.currency_code || "ZAR"} note="Default operating currency." icon={Globe2} />
        <EnterpriseMetricCard title="VAT" value={`${Number(companies[0]?.vat_percent || 15).toFixed(0)}%`} note="Default VAT setting." icon={Percent} dark />
      </section>

      <section className="grid gap-5">
        {companies.map((company) => (
          <div key={company.id} className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone="emerald">{company.subscription_status || "Trial"}</StatusPill>
                  <StatusPill tone="slate">{company.subscription_plan || "Professional"}</StatusPill>
                </div>

                <h2 className="mt-4 text-3xl font-black text-[#07110d]">{company.company_name}</h2>
                <p className="mt-2 text-sm text-slate-500">{company.trading_name || "No trading name captured"}</p>
              </div>

              <div className="grid gap-3 text-sm lg:min-w-[280px]">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <b>Currency:</b> {company.currency_code || "ZAR"}
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <b>VAT:</b> {Number(company.vat_percent || 15).toFixed(2)}%
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <b>Accent:</b> {company.primary_color || "#10b981"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>
    </VyronCostShell>
  );
}
