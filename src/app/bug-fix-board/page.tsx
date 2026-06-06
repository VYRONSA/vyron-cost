import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell title="Bug Fix Board" subtitle="Fix the app in a disciplined order before the client demo.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Priority 1: Broken Pages</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Any page that crashes must be fixed first.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Priority 2: Broken Saves</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Any form that cannot save must be fixed second.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Priority 3: Broken Drilldowns</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Any open/detail button that fails must be fixed third.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Priority 4: Bad Calculations</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Any GP or recovery formula issue must be fixed fourth.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Priority 5: UI Polish</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Only polish spacing and colours after functionality works.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
