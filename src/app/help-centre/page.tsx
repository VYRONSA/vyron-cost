import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell hidePageHeader title="Help Centre" subtitle="Simple support guide for demo users.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">How to add suppliers</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Open Suppliers and add supplier details.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">How to add ingredients</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Open Ingredients and capture cost, unit, category and supplier.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">How to build a BOM</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Open Recipes & BOM, add ingredients and quantities, then save.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">How to link products</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Open Products, select a BOM and set selling price/target GP.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">How to use recovery</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Open Recovery Opportunities and review formula/action.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">How to prepare reports</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Open Reports and choose product GP, recovery or supplier risk.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
