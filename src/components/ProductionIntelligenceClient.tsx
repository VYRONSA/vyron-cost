import Link from "next/link";
import { ProductionIntelSection } from "@/lib/vyron-demo-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const toneClass = {
  red: "text-red-700",
  amber: "text-[var(--vyron-warning-fg)]",
  emerald: "text-[#7E22CE]",
};

export default function ProductionIntelligenceClient({ sections }: { sections: ProductionIntelSection[] }) {
  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        title: "Production Intelligence",
        subtitle: "Premium VYRON COST workflow for production intelligence.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {sections.map((section) => (
              <div
                key={section.id}
                className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]"
              >
                <div className="text-xs font-black uppercase tracking-[0.2em] text-[#7E22CE]">{section.title}</div>
                <div className="mt-5 space-y-4">
                  {section.items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                      <span className="text-sm font-bold text-[#F8FAFC]">{item.label}</span>
                      <span
                        className={`text-sm font-black ${
                          item.tone && item.tone in toneClass ? toneClass[item.tone as keyof typeof toneClass] : "text-slate-600"
                        }`}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white md:col-span-2 xl:col-span-3">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-[#A855F7]">Food manufacturing intelligence</div>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                Production kitchens, factories, catering and franchise groups use the same engines for yield, wastage, batch variance and packaging movement.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/product-profitability" className="rounded-full bg-[#A855F7]/12 px-4 py-2 text-xs font-black text-[#A855F7]">
                  Product GP
                </Link>
                <Link href="/yield-engine" className="rounded-full bg-[#A855F7]/12 px-4 py-2 text-xs font-black text-[#A855F7]">
                  Yield Engine
                </Link>
                <Link href="/financial-leakage" className="rounded-full bg-[#A855F7]/12 px-4 py-2 text-xs font-black text-[#A855F7]">
                  Leakage
                </Link>
              </div>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
