import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";

const sections = [
  ["1. Suppliers", "Add suppliers first so ingredient costs can be linked to supplier risk."],
  ["2. Ingredients", "Capture raw ingredients, purchase cost, previous cost, yield and true unit cost."],
  ["3. BOMs", "Build recipes with ingredients, packaging, labour, overhead and wastage."],
  ["4. Products", "Link finished products to BOMs and set selling price and target GP."],
  ["5. Procurement", "Create purchase orders and capture invoices to compare expected vs actual prices."],
  ["6. Recovery", "Review recovery opportunities and explain the formula to the client."],
];

export default function TrainingPage() {
  return (
    <VyronCostAiShell title="Training Centre" subtitle="Simple training guide for using VYRON COST from start to finish.">
      <Link href="/vyron-academy" className="mb-6 inline-flex rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white">
        Open VYRON COST Academy →
      </Link>
      <section className="grid gap-5">
        {sections.map(([title, text]) => (
          <div key={title} className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <h2 className="text-2xl font-black text-slate-950">{title}</h2>
            <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{text}</p>
          </div>
        ))}
      </section>
    </VyronCostAiShell>
  );
}
