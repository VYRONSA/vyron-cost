import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function DemoDataPage() {
  return (
    <VyronCostAiShell title="Demo Data" subtitle="Use the supplied SQL seed file to populate a realistic pie company demo.">
      <section className="grid gap-5 md:grid-cols-3">
        {[
          ["Suppliers", "Cape Premium Meats, Golden Flour Mills, PackRight Cape"],
          ["Ingredients", "Beef, chicken, flour, margarine, trays and labels"],
          ["Products", "Pepper Steak Pie and Chicken Mushroom Pie"],
        ].map(([title, text]) => (
          <div key={title} className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <h2 className="text-2xl font-black text-violet-700">{title}</h2>
            <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{text}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h2 className="text-2xl font-black text-slate-950">What to run in Supabase</h2>
        <p className="mt-3 text-sm font-semibold text-slate-600">
          Run this file from the pack: supabase/demo_pie_company_seed_data.sql
        </p>
      </section>
    </VyronCostAiShell>
  );
}
