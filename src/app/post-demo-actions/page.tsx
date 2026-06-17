import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell hidePageHeader title="Post-Demo Actions" subtitle="What to do immediately after the client demo.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Send Thank You</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Send a short email thanking the client and summarising pain points.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Request Data</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Ask for product list, ingredients, suppliers and current costings.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Offer Pilot</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Suggest a 10–20 product pilot with their real data.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Set Timeline</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Confirm setup target date and demo follow-up.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Price Proposal</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Send package recommendation and setup estimate.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Track Feedback</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Record what the client liked, disliked and asked for.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
