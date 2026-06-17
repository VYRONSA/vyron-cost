import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell hidePageHeader title="Demo Issue Log" subtitle="Use this during testing to record anything that breaks.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Visual Issue</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Record layout, spacing or font problems.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Save Issue</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Record forms that do not save.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Navigation Issue</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Record sidebar links or routes that fail.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Calculation Issue</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Record GP, cost or recovery formulas that look wrong.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Data Issue</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Record missing demo data or incorrect demo values.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Urgency</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Mark issues as Demo Critical, Important or Later.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
