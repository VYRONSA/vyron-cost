import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell title="Client Proposal" subtitle="Simple proposal language for a prospect.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Problem</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Your business may be losing profit through outdated costings, supplier increases and poor visibility.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Solution</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">VYRON COST creates a live costing and profit intelligence platform across products, suppliers and invoices.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Value</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">The goal is to identify margin leakage and recover preventable losses.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Implementation</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">We start with your highest-volume products and biggest suppliers.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Pricing</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Packages start from R1,950/month, with setup based on data complexity.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Next Step</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Approve pilot setup using a small product range, then expand after validation.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
