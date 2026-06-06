import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell title="Pilot Setup Plan" subtitle="A focused pilot plan to get the first client live quickly.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Pilot Scope</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Start with 20–50 highest-volume products.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Data Import</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Load suppliers, ingredients, recipes, products and recent invoices.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Validation</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Compare VYRON COST calculations to current costing sheets.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Recovery Review</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Identify top 10 recovery opportunities.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Management Review</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Present findings to owner/management.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Go/No-Go</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Convert pilot to paid rollout.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
