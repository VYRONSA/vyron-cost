import Link from "next/link";
import { ProductionIntelSection } from "@/lib/vyron-demo-data";

const toneClass = {
  red: "text-red-700",
  amber: "text-amber-700",
  emerald: "text-emerald-700",
};

export default function ProductionIntelligenceClient({ sections }: { sections: ProductionIntelSection[] }) {
  return (
    <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {sections.map((section) => (
        <div
          key={section.id}
          className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]"
        >
          <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{section.title}</div>
          <div className="mt-5 space-y-4">
            {section.items.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                <span className="text-sm font-bold text-[#07110d]">{item.label}</span>
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
        <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Food manufacturing intelligence</div>
        <p className="mt-3 text-sm leading-7 text-slate-400">
          Production kitchens, factories, catering and franchise groups use the same engines for yield, wastage, batch variance and packaging movement.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/product-profitability" className="rounded-full bg-emerald-400/15 px-4 py-2 text-xs font-black text-emerald-300">
            Product GP
          </Link>
          <Link href="/yield-engine" className="rounded-full bg-emerald-400/15 px-4 py-2 text-xs font-black text-emerald-300">
            Yield Engine
          </Link>
          <Link href="/financial-leakage" className="rounded-full bg-emerald-400/15 px-4 py-2 text-xs font-black text-emerald-300">
            Leakage
          </Link>
        </div>
      </div>
    </section>
  );
}
