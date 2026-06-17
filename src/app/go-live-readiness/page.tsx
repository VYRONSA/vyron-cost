import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell hidePageHeader title="Go-Live Readiness" subtitle="Final checklist before calling VYRON COST ready for a paying client.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">All Key Pages Open</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Dashboard, suppliers, ingredients, BOMs, products, purchase orders, invoices and recovery.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">All Critical Saves Work</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Suppliers, ingredients, BOMs, products, POs and invoices.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Demo Data Loaded</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Client-relevant demo products and recovery examples are visible.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Recovery Explained</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Every recovery value opens with a clear formula.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Training Ready</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Client can follow training manual and demo flow.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Support Ready</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Support, issue log and data request pages are available.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
