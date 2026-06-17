import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell hidePageHeader title="Implementation Plan" subtitle="Simple rollout plan for a new VYRON COST client.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Day 1</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Load company, users, suppliers and ingredient master list.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Day 2</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Build top 20 highest-selling product BOMs.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Day 3</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Link products to BOMs and validate cost/GP.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Day 4</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Capture sample purchase orders and invoices.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Day 5</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Review recovery opportunities and supplier risk.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Week 2</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Bulk import remaining products and train users.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Week 3</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Management review, report setup and final adjustments.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
