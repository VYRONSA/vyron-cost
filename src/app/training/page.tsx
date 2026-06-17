import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { VYRON_BTN, VYRON_SURFACE } from "@/components/vyron-ui";

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
    <VyronCostAiShell hidePageHeader title="Training Centre" subtitle="Simple training guide for using VYRON COST from start to finish.">
      <Link href="/vyron-academy" className={`mb-6 inline-flex ${VYRON_BTN.primary}`}>
        Open VYRON COST Academy →
      </Link>
      <section className="grid gap-5">
        {sections.map(([title, text]) => (
          <div key={title} className={`${VYRON_SURFACE.dark} p-6`}>
            <h2 className="text-2xl font-black text-[#F8FAFC]">{title}</h2>
            <p className="mt-3 text-sm font-semibold leading-7 text-[#CBD5E1]">{text}</p>
          </div>
        ))}
      </section>
    </VyronCostAiShell>
  );
}
