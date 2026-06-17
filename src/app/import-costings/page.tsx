import { FileSpreadsheet, Upload } from "lucide-react";
import ClientBrandLockup from "@/components/ClientBrandLockup";
import ModuleCard from "@/components/ModuleCard";
import QuickActionLink from "@/components/QuickActionLink";
import VyronCostShell from "@/components/VyronCostShell";
import { isHandcraftedDataReady, loadHandcraftedTenant } from "@/lib/handcrafted-tenant";
import { Boxes, ChefHat, PackageSearch } from "lucide-react";

export default function ImportCostingsPage() {
  const ready = isHandcraftedDataReady();
  const meta = loadHandcraftedTenant().meta;

  return (
    <VyronCostShell hidePageHeader title="Handcrafted Food Products Import"
      subtitle="METANOIA HOSPITALITY PTY LTD · GOURMET COSTINGS · REC211 · NEW COSTING SHEET"
    >
      <section className="mb-6 rounded-[2rem] bg-[#07110d] p-7 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
        <ClientBrandLockup variant="dark" size="md" />

        <h2 className="mt-8 text-3xl font-black">Import client spreadsheets</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          Place the three Excel workbooks in <code className="rounded bg-white/10 px-1">data/handcrafted-import/</code>{" "}
          and run the import utility. This creates products, recipes, ingredients, categories, production batches and
          intelligence KPIs for the live demo tenant.
        </p>

        <div className={`mt-6 inline-flex rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.16em] ${ready ? "bg-[#A3E635]/12 text-[#A3E635]" : "bg-amber-400/20 text-amber-200"}`}>
          {ready
            ? `Imported ${meta.product_count} products · ${meta.recipe_count} recipes`
            : "Awaiting import — spreadsheets not loaded"}
        </div>
      </section>

      <section className="mb-6 rounded-[2rem] border border-white bg-white p-7">
        <h3 className="text-xl font-black text-[#07110d]">Required files</h3>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-600">
          <li>GOURMET COSTINGS.xlsx</li>
          <li>REC211 Recipes for Production.xlsx</li>
          <li>NEW COSTING SHEET.xlsx</li>
        </ol>
        <pre className="mt-6 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-sm text-[#A3E635]">
          {`cd vyron-cost-web
# copy files to data/handcrafted-import/
npm run import:handcrafted`}
        </pre>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <ModuleCard href="/products" title="Products" text="Imported SKUs, selling prices and GP targets." icon={PackageSearch} dark />
        <ModuleCard href="/recipes" title="Recipes" text="REC211 production recipes and BOM lines." icon={ChefHat} />
        <ModuleCard href="/ingredients" title="Ingredients" text="Raw materials from recipe sheets." icon={Boxes} />
        <ModuleCard href="/reports" title="Reports" text="Margin and costing reports on imported data." icon={FileSpreadsheet} />
      </section>

      <section className="mt-6 rounded-[2rem] border border-white bg-white p-7 shadow-[0_10px_40px_rgba(15,23,42,0.07)]">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-[#A3E635]/10 p-3 text-[#65A30D]">
            <Upload />
          </div>
          <div>
            <h3 className="text-2xl font-black text-[#07110d]">What gets created</h3>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              Products and cost lines from Gourmet and New Costing sheets. Recipes, ingredients and recipe items from
              REC211. Product and recipe categories. Production batch runs. Product profitability, supplier inflation,
              recovery opportunities, financial leakage and production intelligence — all driven from imported data.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <QuickActionLink href="/dashboard" label="Command Centre" icon={Upload} />
              <QuickActionLink href="/product-profitability" label="Product Profitability" icon={PackageSearch} />
            </div>
          </div>
        </div>
      </section>
    </VyronCostShell>
  );
}
