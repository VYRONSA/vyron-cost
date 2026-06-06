import {
  ArrowRight,
  BarChart3,
  Boxes,
  Calculator,
  Check,
  ChevronRight,
  Cloud,
  FileText,
  Link2,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

const workflow = [
  { step: "1", title: "Add Suppliers", text: "Capture supplier information.", icon: Users },
  { step: "2", title: "Add Ingredients", text: "Add ingredients with true cost.", icon: PackageCheck },
  { step: "3", title: "Build BOMs", text: "Build recipes with weights, labour, packaging and waste.", icon: Boxes },
  { step: "4", title: "Link Products", text: "Connect finished products to their BOMs.", icon: Link2 },
  { step: "5", title: "Set Target GP", text: "Set your target gross profit percentage.", icon: Target },
  { step: "6", title: "Review Price", text: "Get suggested selling prices instantly.", icon: Calculator },
];

const features = [
  { icon: Boxes, title: "BOM Builder", text: "Build accurate recipes, product costs and costing structures." },
  { icon: Calculator, title: "True Cost Engine", text: "Calculate real cost per unit, GP and suggested selling price." },
  { icon: Users, title: "Supplier Intelligence", text: "Track supplier movement and identify product margin risk." },
  { icon: FileText, title: "Invoice & PO Intelligence", text: "Match purchase orders and invoices, then flag price variance." },
  { icon: Target, title: "Recovery Engine", text: "Find profit leakage and turn it into clear recovery actions." },
];

const plans = [
  {
    name: "Starter",
    description: "Perfect for small operations.",
    price: "R1,950",
    items: ["Up to 1,000 ingredients", "Up to 500 products", "BOM Builder", "Basic Reports", "Email Support"],
    popular: false,
  },
  {
    name: "Professional",
    description: "For growing businesses.",
    price: "R3,950",
    items: ["Up to 5,000 ingredients", "Up to 2,500 products", "All Core Features", "Supplier Intelligence", "Recovery Engine", "Priority Support"],
    popular: true,
  },
  {
    name: "Enterprise",
    description: "For large operations.",
    price: "R7,950",
    items: ["Unlimited ingredients", "Unlimited products", "All Features", "AI Cost Assistant", "Custom Reports", "Dedicated Support"],
    popular: false,
  },
];

const included = ["Secure cloud platform", "Real-time calculations", "Automated intelligence", "Excel/PDF export", "Role-based access", "Regular updates"];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-600 to-fuchsia-600 text-xl font-black text-white shadow-xl shadow-violet-500/30">
        V
      </div>
      <div>
        <div className="text-xl font-black tracking-[0.18em] text-slate-950">VYRON</div>
        <div className="-mt-1 text-sm font-black tracking-[0.4em] text-slate-950">COST</div>
      </div>
    </div>
  );
}

export default function VyronCostLandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,#efe7ff_0%,#ffffff_38%,#efffff_100%)] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/82 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Logo />
          <nav className="hidden items-center gap-10 text-sm font-black text-slate-800 lg:flex">
            <a href="#platform">Platform</a>
            <a href="#workflow">Workflow</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-950 shadow-sm">Login</Link>
            <Link href="/dashboard" className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-black text-white shadow-xl shadow-violet-500/25">View Demo</Link>
          </div>
        </div>
      </header>

      <section id="platform" className="mx-auto grid max-w-7xl gap-14 px-6 pb-14 pt-16 lg:grid-cols-[1fr_0.95fr] lg:items-center">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-violet-700 shadow-sm">
            <Sparkles size={15} /> Profit Intelligence Platform
          </div>
          <h1 className="max-w-2xl text-[3.3rem] font-black leading-[0.96] tracking-[-0.06em] text-slate-950 md:text-[5.1rem]">
            Build costs properly.
            <span className="block bg-gradient-to-r from-violet-700 via-blue-600 to-fuchsia-600 bg-clip-text text-transparent">Protect profit instantly.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg font-semibold leading-8 text-slate-600">
            VYRON COST helps businesses create accurate BOMs, calculate true product cost, track supplier movement, protect GP, and identify recovery opportunities before margin disappears.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link href="/dashboard" className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-8 py-4 text-sm font-black uppercase tracking-[0.12em] text-white shadow-2xl shadow-violet-500/30">
              Open Software <ArrowRight size={18} />
            </Link>
            <a href="#workflow" className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-8 py-4 text-sm font-black uppercase tracking-[0.12em] text-slate-950 shadow-sm">
              See Workflow <ChevronRight size={18} />
            </a>
          </div>
          <div className="mt-9 grid max-w-xl gap-4 sm:grid-cols-3">
            {([
              { a: "Accurate Costing", b: "Every time", Icon: Boxes as LucideIcon },
              { a: "Supplier Intelligence", b: "Real-time", Icon: Users as LucideIcon },
              { a: "Margin Protection", b: "Built-in", Icon: ShieldCheck as LucideIcon },
            ]).map(({ a, b, Icon }) => (
              <div key={a} className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700"><Icon size={20} /></div>
                <div className="min-w-0 text-sm font-black leading-5 text-slate-800">{a}<span className="block font-bold text-slate-500">{b}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-10 rounded-[3rem] bg-gradient-to-br from-violet-200/60 via-white to-emerald-100/70 blur-3xl" />
          <div className="relative rounded-[2.2rem] bg-white p-5 shadow-[0_35px_90px_rgba(76,29,149,0.16)]">
            <div className="rounded-[1.8rem] bg-gradient-to-br from-violet-700 via-indigo-700 to-slate-950 p-7 text-white">
              <div className="flex items-center justify-between"><div className="text-xs font-black uppercase tracking-[0.2em] text-violet-100">Live Command Centre</div><span className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-emerald-950">LIVE</span></div>
              <h2 className="mt-3 text-3xl font-black">Profit Protection Status</h2>
              <div className="mt-7 grid gap-4 sm:grid-cols-3">
                {[["Gross Profit", "73.8%", "↑ 5.2% vs last month"], ["Profit Generated", "R1.36M", "↑ R214K vs last month"], ["GP Target", "70%", "On track"]].map(([label, value, note]) => (
                  <div key={label} className="rounded-2xl bg-white/12 p-5 backdrop-blur"><div className="text-xs font-black uppercase tracking-[0.14em] text-violet-100">{label}</div><div className="mt-2 text-3xl font-black">{value}</div><div className="mt-2 text-xs font-bold text-violet-100">{note}</div></div>
                ))}
              </div>
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="rounded-[1.8rem] bg-emerald-50 p-7"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white"><TrendingUp size={24} /></div><div className="mt-7 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Suggested Selling Price</div><div className="mt-2 text-4xl font-black text-emerald-700">R42.90</div><p className="mt-3 text-sm font-bold leading-6 text-slate-700">Based on BOM cost, packaging, labour, wastage and target GP.</p></div>
              <div className="rounded-[1.8rem] bg-violet-50 p-7"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-700 text-white"><Zap size={24} /></div><div className="mt-7 text-xs font-black uppercase tracking-[0.16em] text-violet-700">AI Insight</div><div className="mt-2 text-3xl font-black text-violet-800">Supplier movement detected</div><p className="mt-3 text-sm font-bold leading-6 text-slate-700">Ingredient increases are linked back to affected products automatically.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-3 rounded-[2rem] border border-violet-100 bg-white/80 p-5 shadow-[0_24px_70px_rgba(76,29,149,0.08)] md:grid-cols-5">
          {features.map((feature) => <div key={feature.title} className="rounded-3xl p-5"><feature.icon className="text-violet-700" size={32} /><h3 className="mt-4 text-lg font-black text-slate-950">{feature.title}</h3><p className="mt-2 text-sm font-bold leading-6 text-slate-600">{feature.text}</p></div>)}
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-7xl px-6 py-14">
        <div className="text-center"><div className="text-xs font-black uppercase tracking-[0.25em] text-violet-700">The Core Workflow</div><h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950">From raw ingredients to selling price.</h2></div>
        <div className="mt-10 grid gap-5 md:grid-cols-3 xl:grid-cols-6">
          {workflow.map((item) => <div key={item.step} className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-[0_20px_60px_rgba(76,29,149,0.07)]"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-sm font-black text-violet-700">{item.step}</div><item.icon className="mt-6 text-violet-700" size={30} /><h3 className="mt-5 text-lg font-black text-slate-950">{item.title}</h3><p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{item.text}</p></div>)}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-6 py-14">
        <div className="text-center"><div className="text-xs font-black uppercase tracking-[0.25em] text-violet-700">Simple. Transparent. Built for businesses.</div><h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950">Choose the plan that fits your business.</h2><p className="mx-auto mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-600">Launch pricing. Custom onboarding, integrations and import work can be quoted separately.</p></div>
        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1fr_1fr_1.15fr]">
          {plans.map((plan) => <div key={plan.name} className={`relative rounded-[2rem] border bg-white p-7 shadow-[0_24px_70px_rgba(76,29,149,0.08)] ${plan.popular ? "border-violet-400 ring-4 ring-violet-100" : "border-slate-100"}`}>{plan.popular && <div className="absolute inset-x-0 top-0 rounded-t-[2rem] bg-gradient-to-r from-violet-700 to-fuchsia-600 py-2 text-center text-xs font-black uppercase tracking-[0.18em] text-white">Most Popular</div>}<div className={plan.popular ? "pt-6" : ""}><h3 className="text-2xl font-black text-slate-950">{plan.name}</h3><p className="mt-1 text-sm font-semibold text-slate-500">{plan.description}</p><div className="mt-7 flex items-end gap-2"><span className="text-4xl font-black text-violet-700">{plan.price}</span><span className="pb-1 text-sm font-bold text-slate-600">/month</span></div><div className="mt-1 text-xs font-bold text-slate-500">Billed annually</div><div className="mt-7 space-y-3">{plan.items.map((item) => <div key={item} className="flex gap-3 text-sm font-bold text-slate-700"><Check className="mt-0.5 shrink-0 text-emerald-600" size={17} />{item}</div>)}</div><Link href="/login" className={`mt-8 inline-flex w-full items-center justify-center rounded-2xl px-5 py-4 text-sm font-black uppercase tracking-[0.12em] ${plan.popular ? "bg-gradient-to-r from-violet-700 to-fuchsia-600 text-white shadow-xl shadow-violet-500/20" : "border border-violet-200 bg-white text-violet-700"}`}>Get Started</Link></div></div>)}
          <div className="rounded-[2rem] border border-violet-100 bg-violet-50/80 p-7 shadow-[0_24px_70px_rgba(76,29,149,0.08)]"><h3 className="text-xl font-black text-violet-950">All Plans Include</h3><div className="mt-6 space-y-4">{included.map((item) => <div key={item} className="flex items-center gap-3 text-sm font-black text-violet-950"><Cloud className="text-violet-700" size={19} />{item}</div>)}</div><div className="mt-8 border-t border-violet-200 pt-6"><div className="flex items-start gap-3"><LockKeyhole className="text-violet-700" size={24} /><div><div className="font-black text-violet-950">No lock-in contracts.</div><p className="mt-1 text-sm font-bold leading-6 text-violet-800">Cancel anytime. Import assistance and setup packages available.</p></div></div></div></div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="grid gap-10 rounded-[2.2rem] bg-slate-950 p-10 text-white shadow-[0_35px_100px_rgba(15,23,42,0.18)] lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Ready to protect your profit?</div>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.04em]">See VYRON COST in action.</h2>
            <p className="mt-4 max-w-xl text-base font-semibold leading-7 text-slate-300">
              Book a demo and see how much profit you could recover from costing, supplier movement and margin leakage.
            </p>
            <Link href="/dashboard" className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-8 py-4 text-sm font-black uppercase tracking-[0.12em] text-white">
              Open Demo <ArrowRight size={18} />
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            {([
              { value: "97%", label: "Customer Satisfaction", Icon: Sparkles as LucideIcon },
              { value: "R87M+", label: "Profit Recovered", Icon: BarChart3 as LucideIcon },
              { value: "450+", label: "Active Businesses", Icon: Users as LucideIcon },
            ]).map(({ value, label, Icon }) => (
              <div key={value} className="rounded-3xl bg-white/8 p-6 text-center">
                <Icon className="mx-auto text-violet-300" size={30} />
                <div className="mt-4 text-3xl font-black text-violet-300">{value}</div>
                <div className="mt-2 text-sm font-bold text-slate-200">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white/70"><div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-9 md:flex-row md:items-center md:justify-between"><Logo /><div className="text-sm font-bold text-slate-500">© 2026 VYRON COST. Profit Intelligence Platform.</div></div></footer>
    </main>
  );
}
