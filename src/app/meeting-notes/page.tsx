import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell title="Client Meeting Notes" subtitle="Capture client feedback during or after the meeting.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Client Pain Points</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">What is currently difficult for them?</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Current Process</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Do they use Excel, Pastel, Sage, Xero, manual files or another tool?</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Top Product Range</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Which products should we load first for a pilot?</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Supplier Concerns</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Which suppliers have the biggest price movement?</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Decision Makers</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Who must approve the software?</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Next Step</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Agree on pilot, data request and follow-up date.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
