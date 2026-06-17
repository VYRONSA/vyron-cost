import Link from "next/link";
import { ArrowRight, Boxes, Calculator, ClipboardList, FileText, Package, PackageCheck, Target, Users } from "lucide-react";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import type { LucideIcon } from "lucide-react";

const steps: Array<{ title: string; href: string; Icon: LucideIcon; text: string }> = [
  { title: "Suppliers", href: "/suppliers", Icon: Users, text: "Show where cost risk begins." },
  { title: "Ingredients", href: "/ingredients", Icon: PackageCheck, text: "Show true cost and price movement." },
  { title: "Build BOM", href: "/recipes/new", Icon: Boxes, text: "Create a real recipe with ingredients, packaging, labour and waste." },
  { title: "Products", href: "/products", Icon: Package, text: "Link product to BOM and show GP." },
  { title: "Profitability", href: "/product-profitability", Icon: Calculator, text: "Show actual GP and suggested price." },
  { title: "Purchase Orders", href: "/purchase-orders", Icon: ClipboardList, text: "Show expected supplier pricing." },
  { title: "Invoice Intelligence", href: "/document-intelligence", Icon: FileText, text: "Show invoice variance and duplicate risk." },
  { title: "Recovery", href: "/recovery-opportunities", Icon: Target, text: "Close with recoverable profit." },
];

export default function DemoFlowPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Client Demo Flow" subtitle="Use this page as the exact demo script for the prospect.">
      <section className="grid gap-5 md:grid-cols-4">
        {["15 min demo", "Show BOM", "Show GP", "Close Recovery"].map((item) => (
          <div key={item} className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-2xl font-black text-violet-700">{item}</div>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-5">
        {steps.map(({ title, href, Icon, text }, index) => (
          <Link key={title} href={href} className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)] transition hover:-translate-y-1">
            <div className="grid gap-5 md:grid-cols-[64px_1fr_120px] md:items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                <Icon size={28} />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-700">Step {index + 1}</div>
                <h3 className="mt-1 text-2xl font-black text-slate-950">{title}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{text}</p>
              </div>
              <div className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-50 px-5 py-4 text-sm font-black text-violet-700">
                Open <ArrowRight size={17} />
              </div>
            </div>
          </Link>
        ))}
      </section>
    </VyronCostAiShell>
  );
}
