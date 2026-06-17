import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell hidePageHeader title="Client Onboarding Checklist" subtitle="What must be collected from a client before implementation.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Company Details</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Company name, branches, users and admin contact.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Suppliers</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Supplier list with contacts, invoice emails and payment terms.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Ingredients</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Ingredient list with units, prices, suppliers and categories.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Products</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Finished product list with selling prices and target GP.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">BOMs / Recipes</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Recipes, ingredient quantities, packaging, labour, wastage and yield.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Purchase History</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Recent invoices and purchase orders for price history.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Sales Volumes</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Monthly product sales volumes to calculate realistic recovery opportunities.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
