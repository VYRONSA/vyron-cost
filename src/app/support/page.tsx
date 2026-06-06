import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell title="Support" subtitle="Simple support structure for demo and pilot clients.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">WhatsApp Support</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Use WhatsApp for urgent demo/pilot issues.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Email Support</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Use email for data files and structured requests.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Weekly Check-in</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">During pilot, schedule weekly feedback call.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Bug Reporting</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Screenshot the issue and describe the page/action.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Data Help</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Assist with cleaning and importing templates.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Training</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Provide user training after first data load.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
