import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell hidePageHeader title="What VYRON COST Does" subtitle="Clear explanation of the platform for clients.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Costing Engine</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Build product cost from ingredients, packaging, labour, overhead and wastage.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Profit Engine</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Calculate actual GP, target GP gap and suggested selling price.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Supplier Intelligence</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Detect supplier price movement and affected products.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Procurement Intelligence</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Capture purchase orders and supplier invoices.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Recovery Engine</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Identify potential monthly and annual recoverable profit.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Reporting</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Turn costing data into management-ready reports and actions.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
