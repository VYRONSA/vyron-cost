import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell hidePageHeader title="Training Manual" subtitle="Step-by-step client training manual inside the software.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Step 1: Setup Suppliers</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Add all suppliers before building ingredients and procurement workflows.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Step 2: Setup Ingredients</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Capture cost, unit, supplier, previous cost and yield.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Step 3: Build BOMs</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Add ingredients, packaging, labour, overhead and wastage.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Step 4: Setup Products</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Link products to BOMs and set selling price/target GP.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Step 5: Procurement</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Create purchase orders and capture invoices.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Step 6: Recovery</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Review recovery opportunities and take action.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
