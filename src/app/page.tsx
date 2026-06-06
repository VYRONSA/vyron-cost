import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Crown,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 via-purple-700 to-fuchsia-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.45)]">
        <div className="absolute inset-0 rounded-3xl bg-white/10" />
        <div className="relative flex gap-0.5">
          <span className="block h-8 w-3 rotate-[-24deg] rounded-full bg-white/95" />
          <span className="block h-8 w-3 rotate-[24deg] rounded-full bg-slate-950/65" />
        </div>
      </div>
      <div>
        <div className="text-2xl font-black tracking-[0.32em] text-slate-950">VYRON</div>
        <div className="-mt-1 text-sm font-black tracking-[0.46em] text-fuchsia-600">COST</div>
      </div>
    </Link>
  );
}

function MiniSparkline({ color = "#8b5cf6" }: { color?: string }) {
  return (
    <svg viewBox="0 0 180 42" className="absolute bottom-3 right-4 h-10 w-36 opacity-45">
      <path
        d="M2 34 C 24 18, 35 31, 54 18 S 83 8, 102 20 S 128 31, 146 15 S 166 4, 178 10"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const pricingPlans = [
  {
    name: "Starter",
    price: "R1,499",
    tag: "Costing Foundation",
    icon: PackageOpen,
    description: "For small manufacturers and single-site operations that need proper costing control.",
    features: [
      "Products, recipes and BOM costing",
      "Ingredients and packaging library",
      "Supplier list and basic purchase tracking",
      "Suggested selling price and GP targets",
      "Basic costing reports",
      "Up to 3 users",
    ],
    accent: "from-violet-600 to-indigo-700",
  },
  {
    name: "Growth",
    price: "R3,499",
    tag: "Procurement Intelligence",
    icon: TrendingUp,
    description: "For growing teams that need supplier, invoice and purchase visibility.",
    features: [
      "Everything in Starter",
      "Purchase Orders",
      "Document Intelligence",
      "AI invoice capture allowance",
      "Supplier Intelligence",
      "Cost trend monitoring",
      "Up to 10 users",
    ],
    accent: "from-fuchsia-600 to-violet-700",
    popular: true,
  },
  {
    name: "Professional",
    price: "R6,999",
    tag: "Profit Protection",
    icon: ShieldCheck,
    description: "For serious operations that want margin protection and leakage detection.",
    features: [
      "Everything in Growth",
      "Recovery Intelligence Centre",
      "Duplicate invoice detection",
      "Procurement Intelligence",
      "AI margin protection",
      "Executive dashboards",
      "Multi-branch visibility",
    ],
    accent: "from-slate-950 to-violet-900",
  },
  {
    name: "Enterprise",
    price: "Custom",
    tag: "Enterprise Intelligence",
    icon: Crown,
    description: "For groups, franchises and multi-company operations with advanced integration needs.",
    features: [
      "Multiple companies and branches",
      "Advanced permissions",
      "ERP, Xero and Sage integrations",
      "Custom reports and onboarding",
      "Dedicated implementation support",
      "Executive board packs",
      "High-volume AI document processing",
    ],
    accent: "from-orange-500 to-fuchsia-600",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#fbf5ff_0%,#f8fbff_38%,#ffffff_100%)] text-slate-950">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-24 top-10 h-96 w-96 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute right-10 top-16 h-96 w-96 rounded-full bg-fuchsia-200/35 blur-3xl" />
        <div className="absolute bottom-20 left-1/2 h-96 w-96 rounded-full bg-emerald-200/25 blur-3xl" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Logo />

        <nav className="hidden items-center gap-8 text-sm font-black text-slate-600 md:flex">
          <a href="#platform">Platform</a>
          <a href="#workflow">Workflow</a>
          <a href="#pricing">Pricing</a>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-sm">
            Login
          </Link>
          <Link href="/dashboard" className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/20">
            Open Software
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-12 px-6 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-violet-700 shadow-sm">
            <Sparkles size={15} />
            AI Profit Protection Platform
          </div>

          <h1 className="mt-6 text-6xl font-black leading-[0.95] tracking-[-0.06em] text-slate-950 md:text-7xl">
            Protect margin.
            <br />
            Detect leakage.
            <br />
            <span className="bg-gradient-to-r from-violet-700 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">
              Recover profit.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-slate-600">
            VYRON COST is an AI procurement intelligence and profit protection platform for serious food manufacturers, restaurant groups and multi-site operations.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-7 py-4 text-sm font-black uppercase tracking-[0.12em] text-white shadow-xl shadow-violet-500/25">
              Enter VYRON COST <ArrowRight size={18} />
            </Link>
            <a href="#pricing" className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-4 text-sm font-black uppercase tracking-[0.12em] text-slate-950 shadow-sm">
              View Pricing
            </a>
          </div>

          <div className="mt-8 grid max-w-2xl grid-cols-2 gap-4 md:grid-cols-4">
            {[
              ["BOM", "Recipe costing"],
              ["AI", "Invoice capture"],
              ["GP", "Margin control"],
              ["Recovery", "Leakage detection"],
            ].map(([title, sub]) => (
              <div key={title} className="rounded-3xl bg-white/90 p-4 shadow-[0_12px_36px_rgba(76,29,149,0.08)]">
                <div className="text-2xl font-black text-slate-950">{title}</div>
                <div className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-slate-400">{sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -left-8 top-6 text-3xl text-pink-500">✦</div>
          <div className="absolute right-12 top-0 text-2xl text-amber-400">✧</div>
          <div className="absolute -right-4 bottom-20 text-2xl text-emerald-400">◆</div>

          <div className="rounded-[2.8rem] border border-violet-100 bg-white p-5 shadow-[0_30px_90px_rgba(88,28,135,0.16)]">
            <div className="rounded-[2.2rem] bg-gradient-to-br from-violet-700 via-fuchsia-600 to-indigo-800 p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-100">Live Command Centre</div>
                  <h2 className="mt-2 text-2xl font-black">Profit Protection Status</h2>
                </div>
                <div className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950">LIVE</div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {[
                  ["Potential Recovery", "R84k"],
                  ["Supplier Risks", "12"],
                  ["GP Exposure", "R312k"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-3xl bg-white/15 p-4">
                    <div className="text-xs font-black uppercase text-violet-100">{label}</div>
                    <div className="mt-2 text-3xl font-black">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="relative overflow-hidden rounded-[2rem] bg-emerald-50 p-6">
                <MiniSparkline color="#10b981" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white">
                  <Target size={25} />
                </div>
                <div className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Suggested Price</div>
                <div className="mt-2 text-4xl font-black text-emerald-700">R42.90</div>
                <p className="mt-2 text-sm font-bold leading-6 text-emerald-900">
                  Based on BOM cost, packaging, labour, wastage and target GP.
                </p>
              </div>

              <div className="relative overflow-hidden rounded-[2rem] bg-violet-50 p-6">
                <MiniSparkline color="#8b5cf6" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white">
                  <BrainCircuit size={25} />
                </div>
                <div className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-violet-700">AI Insight</div>
                <div className="mt-2 text-2xl font-black text-violet-800">Supplier movement detected</div>
                <p className="mt-2 text-sm font-bold leading-6 text-violet-900">
                  Ingredient increases are linked back to affected products automatically.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="relative z-10 mx-auto max-w-7xl px-6 py-14">
        <div className="mb-8">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">The Core Workflow</div>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950">From raw ingredients to profit protection.</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-6">
          {["Add suppliers", "Add ingredients", "Build BOMs", "Upload invoices", "Detect leakage", "Recover profit"].map((step, index) => (
            <div key={step} className="rounded-3xl bg-white p-5 shadow-[0_12px_36px_rgba(76,29,149,0.08)]">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-sm font-black text-violet-700">{index + 1}</div>
              <div className="mt-8 text-lg font-black text-slate-950">{step}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="platform" className="relative z-10 mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-6 md:grid-cols-4">
          {[
            [PackageOpen, "Recipe & BOM Costing", "Build products from ingredients, packaging, labour, wastage and markup."],
            [TrendingUp, "True Cost Engine", "Calculate cost per unit, GP percentage and suggested selling price."],
            [ShieldCheck, "Supplier Intelligence", "Track supplier movement and see which products lose margin."],
            [ClipboardList, "Invoice & PO Intelligence", "Upload purchase orders and invoices, then match lines and flag risk."],
          ].map(([Icon, title, body]: any) => (
            <div key={title} className="rounded-[2rem] bg-white p-6 shadow-[0_12px_36px_rgba(76,29,149,0.08)] transition hover:-translate-y-1 hover:shadow-xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white">
                <Icon size={24} />
              </div>
              <h3 className="mt-5 text-xl font-black text-slate-950">{title}</h3>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="relative z-10 mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-violet-700">
            <Wallet size={15} />
            Premium Platform Pricing
          </div>
          <h2 className="mt-5 text-5xl font-black tracking-[-0.05em] text-slate-950">
            Built for serious profit protection.
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-base font-semibold leading-8 text-slate-600">
            VYRON COST is not positioned as cheap costing software. It is an AI procurement intelligence and margin protection platform designed to recover profit, reduce leakage and give management visibility.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-4">
          {pricingPlans.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.name}
                className={`relative overflow-hidden rounded-[2.4rem] border bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.10)] transition hover:-translate-y-1 hover:shadow-2xl ${
                  plan.popular ? "border-fuchsia-300 ring-4 ring-fuchsia-100" : "border-violet-100"
                }`}
              >
                {plan.popular ? (
                  <div className="absolute right-5 top-5 rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white">
                    Most Popular
                  </div>
                ) : null}

                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${plan.accent} text-white shadow-lg shadow-violet-500/20`}>
                  <Icon size={27} />
                </div>

                <div className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-violet-600">{plan.tag}</div>
                <h3 className="mt-2 text-3xl font-black text-slate-950">{plan.name}</h3>

                <div className="mt-5 flex items-end gap-1">
                  <div className="text-5xl font-black tracking-[-0.05em] text-slate-950">{plan.price}</div>
                  {plan.price !== "Custom" ? <div className="pb-2 text-sm font-black text-slate-400">/month</div> : null}
                </div>

                <p className="mt-4 min-h-[74px] text-sm font-semibold leading-7 text-slate-600">{plan.description}</p>

                <div className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3 text-sm font-bold text-slate-700">
                      <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={18} />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <Link
                  href="/dashboard"
                  className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-black uppercase tracking-[0.12em] ${
                    plan.popular
                      ? "bg-gradient-to-r from-violet-700 to-fuchsia-600 text-white shadow-lg shadow-violet-500/20"
                      : "bg-violet-50 text-violet-700"
                  }`}
                >
                  View Platform <ArrowRight size={17} />
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-[2rem] bg-slate-950 p-7 text-white shadow-[0_18px_60px_rgba(15,23,42,0.20)]">
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-fuchsia-300">
                <Zap size={15} />
                AI Included
              </div>
              <h3 className="mt-4 text-3xl font-black tracking-[-0.04em]">
                AI document processing is included inside the package.
              </h3>
            </div>
            <p className="text-sm font-semibold leading-7 text-slate-300">
              Customers are not buying OpenAI credits. They are buying VYRON COST: costing, procurement intelligence, document capture, supplier intelligence and recovery visibility. Fair-use document limits can be added per package later, but the AI should feel like part of the product, not an extra hidden fee.
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-14">
        <div className="rounded-[2.8rem] bg-[#09031f] p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)] md:p-12">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">Why VYRON COST</div>
              <h2 className="mt-5 text-5xl font-black tracking-[-0.05em]">
                Not just costing.
                <br />
                A profit recovery system.
              </h2>
              <p className="mt-6 max-w-xl text-base font-semibold leading-8 text-slate-300">
                Normal spreadsheets tell you what a product used to cost. VYRON COST helps you build the BOM, protect the GP, detect supplier changes, and show management exactly what to fix.
              </p>
              <Link href="/dashboard" className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-4 text-sm font-black uppercase tracking-[0.12em] text-slate-950">
                Enter VYRON COST <ArrowRight size={18} />
              </Link>
            </div>

            <div className="grid gap-4">
              {[
                ["BOM Builder", "Choose ingredients, add weights, packaging, labour, wastage and markup."],
                ["True Costing", "Calculate cost per product and selling price from the BOM."],
                ["Margin Protection", "See products under target GP and suggested price changes."],
                ["Recovery Intelligence", "Turn duplicate invoices, supplier inflation and leakage into action."],
              ].map(([title, body]) => (
                <div key={title} className="rounded-3xl bg-white/10 p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-1 text-emerald-300" size={22} />
                    <div>
                      <div className="font-black text-white">{title}</div>
                      <p className="mt-1 text-sm font-semibold leading-6 text-slate-300">{body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
