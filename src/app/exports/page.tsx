import { ShieldAlert, MailCheck, FileSpreadsheet, Settings, Boxes, Calculator, ChefHat, FileBarChart2, PackageSearch, Truck, Upload } from "lucide-react";
import ModuleCard from "@/components/ModuleCard";
import QuickActionLink from "@/components/QuickActionLink";
import VyronCostShell from "@/components/VyronCostShell";

export default function Page() {
  return (
    <VyronCostShell hidePageHeader title="Exports" subtitle="Open export templates and report downloads.">
      <section className="mb-6 rounded-[2rem] border border-white bg-white p-7 shadow-[0_10px_40px_rgba(15,23,42,0.07)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-black text-[#07110d]">Exports</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
              This page now contains real clickable navigation blocks. The next pack will add module-specific working actions.
            </p>
          </div>
          <QuickActionLink href="/import-costings" label="Import Costings" icon={Upload} />
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <ModuleCard href="/ingredients" title="Ingredients" text="Open raw materials and true yield cost rules." icon={Boxes} dark />
        <ModuleCard href="/recipes" title="Recipes" text="Open recipe costing and recipe line totals." icon={ChefHat} />
        <ModuleCard href="/products" title="Products" text="Open product margins and recipe links." icon={PackageSearch} />
        <ModuleCard href="/invoice-ai" title="Invoice AI" text="Open invoice extraction and review." icon={MailCheck} />
        <ModuleCard href="/supplier-intelligence" title="Supplier Intelligence" text="Open supplier price movement and savings." icon={Truck} />
        <ModuleCard href="/reports" title="Reports" text="Open reports and batch variance." icon={FileBarChart2} />
      </section>
    </VyronCostShell>
  );
}
