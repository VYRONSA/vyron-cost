import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";

const checks = [
  ["/dashboard", "Dashboard opens"],
  ["/demo-flow", "Demo flow opens"],
  ["/demo-data", "Demo data guide opens"],
  ["/suppliers", "Suppliers opens"],
  ["/ingredients", "Ingredients opens"],
  ["/recipes", "Recipes opens"],
  ["/recipes/new", "New BOM opens"],
  ["/products", "Products opens"],
  ["/purchase-orders", "Purchase orders opens"],
  ["/document-intelligence", "Document intelligence opens"],
  ["/recovery-opportunities", "Recovery opens"],
  ["/reports", "Reports opens"],
];

export default function TestingCentrePage() {
  return (
    <VyronCostAiShell title="Testing Centre" subtitle="Click every route before the client demo. Fix anything red immediately.">
      <section className="grid gap-4">
        {checks.map(([href, label], index) => (
          <Link key={href} href={href} className="rounded-2xl bg-white p-5 text-sm font-black text-slate-800 shadow-[0_12px_35px_rgba(81,63,190,0.06)] transition hover:bg-violet-50">
            {index + 1}. {label}
            <span className="ml-3 text-violet-700">{href}</span>
          </Link>
        ))}
      </section>
    </VyronCostAiShell>
  );
}
