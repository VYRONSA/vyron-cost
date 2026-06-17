import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell hidePageHeader title="Client Demo Script" subtitle="Exact words and flow to use when presenting VYRON COST.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Opening</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Most businesses know what they sell for, but not what every product truly costs today. VYRON COST connects suppliers, ingredients, BOMs, products, purchase orders and invoices to protect profit.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Show Suppliers</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Explain supplier cost movement and how supplier risk affects product margin.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Show Ingredients</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Show current cost, previous cost, true unit cost and affected BOMs.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Show BOM Builder</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Create or open a BOM and explain ingredients, packaging, labour, overhead and wastage.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Show Products</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Link finished product to BOM and show actual GP and suggested selling price.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Show Recovery</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Open recovery opportunities and explain formula, monthly recovery and annual recovery.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Close</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">The value is not just costing. The value is finding money that is already leaking from the business.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
