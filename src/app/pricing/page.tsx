import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell title="Pricing & Packages" subtitle="Client-facing pricing structure for VYRON COST.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Starter — R1,950/month</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Small operations. BOM Builder, ingredients, suppliers, products, basic reports.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Professional — R3,950/month</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Growing businesses. Includes supplier intelligence, recovery engine, purchase orders and invoice capture.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Enterprise — R7,950/month</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Larger operations. Includes advanced reporting, multi-site support, AI assistance and priority support.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Setup Fee</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Optional onboarding/import/setup can be quoted separately depending on data complexity.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-950">Launch Offer</h2>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">Early clients can receive discounted setup in exchange for feedback and testimonial.</p>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
