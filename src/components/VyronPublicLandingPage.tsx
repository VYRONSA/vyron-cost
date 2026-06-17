import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Crown,
  Factory,
  FileText,
  Link2,
  Package,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <div
        className={`relative flex h-12 w-12 items-center justify-center sm:h-14 sm:w-14 sm:rounded-3xl ${M.iconEmphasis}`}
      >
        <div className="relative flex gap-0.5">
          <span className="block h-6 w-2 rotate-[-24deg] rounded-full bg-white/95 sm:h-8 sm:w-3" />
          <span className="block h-6 w-2 rotate-[24deg] rounded-full bg-[#07111F]/80 sm:h-8 sm:w-3" />
        </div>
      </div>
      <div>
        <div className="text-lg font-black tracking-[0.28em] text-[#0F172A] sm:text-2xl sm:tracking-[0.32em]">VYRON</div>
        <div className="-mt-0.5 text-xs font-black tracking-[0.4em] text-[#7C3AED] sm:-mt-1 sm:text-sm sm:tracking-[0.46em]">
          COST
        </div>
      </div>
    </Link>
  );
}

function MiniSparkline({ color = "#9333EA" }: { color?: string }) {
  return (
    <svg viewBox="0 0 180 42" className="absolute bottom-3 right-3 h-8 w-28 opacity-40 sm:h-10 sm:w-36">
      <path
        d="M2 34 C 24 18, 35 31, 54 18 S 83 8, 102 20 S 128 31, 146 15 S 166 4, 178 10"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LightCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${M.lightCard} p-5 ${M.lightCardHover} ${className}`}>{children}</div>;
}

const intelligenceModules = [
  {
    icon: ShieldCheck,
    title: "Supplier Intelligence",
    body: "Track supplier inflation, price movement and procurement risk before margin erodes.",
    emphasis: true,
  },
  {
    icon: ClipboardList,
    title: "Procurement Control",
    body: "Purchase orders, approvals, GRNs and three-way matching in one controlled flow.",
    emphasis: true,
  },
  {
    icon: Package,
    title: "Inventory Accuracy",
    body: "Stock ledger, movements, counts and finished goods valued from live cost data.",
  },
  {
    icon: Target,
    title: "Recipe & BOM Costing",
    body: "Ingredients, packaging, labour, wastage and markup rolled into true product cost.",
    emphasis: true,
  },
  {
    icon: Factory,
    title: "Manufacturing Runs",
    body: "Production consumption, variances and finished goods output with audit trail.",
  },
  {
    icon: FileText,
    title: "Customer Invoices",
    body: "Sales invoices linked to stock, margin and customer profitability.",
  },
  {
    icon: Link2,
    title: "Xero Integration",
    body: "Xero-ready sync centre for approved accounting-ready transactions.",
    xero: true,
  },
  {
    icon: BrainCircuit,
    title: "AI Cost Brain",
    body: "Document intelligence, price history learning and cost recovery signals.",
    emphasis: true,
  },
];

const workflowSteps = [
  { label: "Supplier", icon: Truck },
  { label: "PO", icon: ClipboardList },
  { label: "GRN", icon: PackageOpen },
  { label: "Inventory", icon: Package },
  { label: "Manufacturing", icon: Factory },
  { label: "Finished Goods", icon: Target },
  { label: "Customer Invoice", icon: FileText },
  { label: "Xero", icon: Link2, xero: true },
];

const clientOutcomes = [
  "Know true product cost across recipes, BOMs and production runs",
  "Stop supplier price creep before it hits GP",
  "Track stock movement with auditable ledger entries",
  "Control production profitability and manufacturing variances",
  "Reduce manual spreadsheet work across procurement and finance",
  "Improve purchasing decisions with supplier intelligence",
  "Prepare accurate sales, margin and board-ready reports",
];

const pricingPlans = [
  {
    name: "Starter",
    price: "R1,499",
    tag: "Costing Foundation",
    icon: PackageOpen,
    description: "For single-site manufacturers and operators building proper costing discipline.",
    features: [
      "Products, recipes and BOM costing",
      "Ingredients and packaging library",
      "Supplier list and purchase tracking",
      "Suggested selling price and GP targets",
      "Basic costing reports",
      "Up to 3 users",
    ],
  },
  {
    name: "Professional",
    price: "R3,499",
    tag: "Recommended",
    icon: TrendingUp,
    description: "For growing teams that need procurement, inventory and manufacturing control in one platform.",
    features: [
      "Everything in Starter",
      "Purchase orders and GRNs",
      "Document Intelligence",
      "Inventory and manufacturing runs",
      "Supplier Intelligence",
      "Customer invoices and Xero sync centre",
      "Up to 10 users",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    tag: "Multi-Company",
    icon: Crown,
    description: "For groups, franchises and multi-branch operations with advanced integration needs.",
    features: [
      "Multiple companies and branches",
      "Advanced permissions and audit",
      "ERP, Xero and Sage integrations",
      "Custom reports and onboarding",
      "Dedicated implementation support",
      "Executive board packs",
      "High-volume AI document processing",
    ],
  },
];

export default function VyronPublicLandingPage() {
  return (
    <main className={M.page}>
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(124,58,237,0.07),transparent_42%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_12%,rgba(244,63,94,0.05),transparent_38%)]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <header className={`relative z-10 ${M.publicHeader}`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 sm:py-6">
          <Logo />
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#modules" className={M.navLink}>
              Platform
            </a>
            <a href="#workflow" className={M.navLink}>
              Workflow
            </a>
            <a href="#value" className={M.navLink}>
              Outcomes
            </a>
            <a href="#pricing" className={M.navLink}>
              Pricing
            </a>
          </nav>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link href="/login" className={`${M.secondaryBtn} px-4 py-2.5 text-xs sm:px-5 sm:py-3 sm:text-sm`}>
              Sign In
            </Link>
            <Link
              href="/login"
              className={`${M.primaryBtn} px-4 py-2.5 text-xs sm:px-5 sm:py-3 sm:text-sm`}
            >
              Open VYRON COST
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto grid max-w-7xl gap-12 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-14">
        <div>
          <div className={M.eyebrow}>
            <Sparkles size={14} className="text-[#E11D48]" />
            VYRON COST
          </div>

          <h1 className={`mt-5 text-4xl leading-[1.02] tracking-[-0.04em] sm:mt-6 sm:text-5xl lg:text-6xl ${M.heading}`}>
            AI Cost Intelligence for Procurement, Inventory &amp; Manufacturing
          </h1>

          <p className={`mt-5 max-w-2xl text-base leading-7 sm:mt-6 sm:text-lg sm:leading-8 ${M.body}`}>
            Control supplier pricing, purchase orders, ingredients, stock, recipes, manufacturing runs, finished goods and
            customer profitability from one intelligent platform.
          </p>

          <div className="mt-7 flex flex-wrap gap-3 sm:mt-8 sm:gap-4">
            <Link
              href="/login"
              className={`${M.primaryBtn} px-6 py-3.5 text-xs uppercase tracking-[0.1em] sm:px-7 sm:py-4 sm:text-sm`}
            >
              Open VYRON COST <ArrowRight size={16} />
            </Link>
            <a
              href="#modules"
              className={`${M.secondaryBtn} px-6 py-3.5 text-xs font-bold uppercase tracking-[0.1em] sm:px-7 sm:py-4 sm:text-sm`}
            >
              View Features
            </a>
            <Link
              href="/login"
              className={`${M.ghostBtn} px-6 py-3.5 text-xs font-bold uppercase tracking-[0.1em] sm:px-7 sm:py-4 sm:text-sm`}
            >
              Request Demo
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {[
              ["68%", "Avg GP visibility", true],
              ["24/7", "Cost monitoring", false],
              ["PO→GRN", "Procurement chain", false],
              ["Xero", "Ledger ready", false],
            ].map(([value, label, accent]) => (
              <LightCard key={String(label)} className="p-3 sm:p-4">
                <div
                  className={`text-xl sm:text-2xl ${accent ? M.accentKpiGradient : "font-black text-[#0F172A]"}`}
                >
                  {value}
                </div>
                <div className={`mt-1 text-[10px] font-bold uppercase tracking-[0.12em] sm:text-xs ${M.muted}`}>
                  {label}
                </div>
              </LightCard>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-3 rounded-[2.5rem] bg-gradient-to-br from-[#E11D48]/10 via-[#7C3AED]/8 to-transparent blur-xl" />
          <div className={`relative p-4 sm:p-5 ${M.darkPanel}`}>
            <div className={`p-5 sm:p-6 ${M.darkPanelInner}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className={`text-[10px] font-bold uppercase tracking-[0.18em] sm:text-xs ${M.mutedOnDark}`}>
                    Live Dashboard Preview
                  </div>
                  <h2 className={`mt-1 text-xl sm:mt-2 sm:text-2xl ${M.headingOnDark}`}>Cost Intelligence Command</h2>
                </div>
                <div className={M.statusLive}>LIVE</div>
              </div>

              <div className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4">
                {[
                  ["Inventory Value", "R1.24M", false],
                  ["Open POs", "18", false],
                  ["GP at Risk", "R84k", true],
                ].map(([label, value, accent]) => (
                  <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
                    <div className={`text-[10px] font-bold uppercase tracking-[0.12em] sm:text-xs ${M.mutedOnDark}`}>
                      {label}
                    </div>
                    <div
                      className={`mt-1 text-2xl sm:mt-2 sm:text-3xl ${accent ? M.accentKpi : "font-black text-[#F8FAFC]"}`}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:mt-5 md:grid-cols-2">
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:rounded-[1.5rem]">
                <MiniSparkline color="#F43F5E" />
                <div className={`h-10 w-10 sm:h-12 sm:w-12 ${M.iconEmphasis}`}>
                  <Target size={22} />
                </div>
                <div className={`mt-4 text-[10px] font-bold uppercase tracking-[0.14em] sm:text-xs ${M.mutedOnDark}`}>
                  Suggested Price
                </div>
                <div className={`mt-1 text-3xl sm:text-4xl ${M.accentKpi}`}>R42.90</div>
                <p className={`mt-2 text-xs leading-6 sm:text-sm ${M.bodyOnDark}`}>
                  BOM cost, packaging, labour, wastage and target GP in one view.
                </p>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:rounded-[1.5rem]">
                <MiniSparkline />
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-[#7C3AED]/20 text-violet-200 sm:h-12 sm:w-12 sm:rounded-2xl">
                  <BrainCircuit size={22} />
                </div>
                <div className={`mt-4 text-[10px] font-bold uppercase tracking-[0.14em] sm:text-xs ${M.mutedOnDark}`}>
                  AI Insight
                </div>
                <div className={`mt-1 text-lg sm:text-xl ${M.headingOnDark}`}>Supplier movement detected</div>
                <p className={`mt-2 text-xs leading-6 sm:text-sm ${M.bodyOnDark}`}>
                  Ingredient increases linked to affected products and margin exposure.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Intelligence Modules */}
      <section id="modules" className={`relative z-10 py-14 sm:py-16 ${M.pageAlt}`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 max-w-3xl sm:mb-10">
            <div className={M.sectionLabel}>Intelligence Modules</div>
            <h2 className={`mt-3 text-3xl sm:text-4xl ${M.heading}`}>
              One platform for cost, procurement and production control
            </h2>
            <p className={`mt-4 text-sm leading-7 sm:text-base ${M.muted}`}>
              Built for manufacturers, food producers, hospitality groups, franchises and multi-branch operations.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {intelligenceModules.map(({ icon: Icon, title, body, emphasis, xero }) => (
              <LightCard key={title}>
                <div
                  className={
                    xero
                      ? `h-11 w-11 ${M.iconXero}`
                      : emphasis
                        ? `h-11 w-11 ${M.iconEmphasis}`
                        : `h-11 w-11 ${M.iconSubtle}`
                  }
                >
                  <Icon size={22} />
                </div>
                <h3 className={`mt-4 text-lg ${M.heading}`}>{title}</h3>
                <p className={`mt-2 text-sm leading-6 ${M.muted}`}>{body}</p>
              </LightCard>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="relative z-10 mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="mb-8 sm:mb-10">
          <div className={M.sectionLabel}>Operational Chain</div>
          <h2 className={`mt-3 text-3xl sm:text-4xl ${M.heading}`}>From supplier to ledger — fully connected</h2>
        </div>

        <div className="flex flex-wrap items-stretch justify-center gap-2 sm:gap-3">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;
            const isXero = "xero" in step && step.xero;
            return (
              <div key={step.label} className="flex items-center gap-2 sm:gap-3">
                <LightCard className="flex min-w-[7.5rem] flex-col items-center px-4 py-4 text-center sm:min-w-[8.5rem] sm:px-5">
                  <div className={isXero ? `h-10 w-10 ${M.iconXero}` : `h-10 w-10 ${M.iconSubtle}`}>
                    <Icon size={20} />
                  </div>
                  <div className={`mt-3 text-xs font-bold sm:text-sm ${isXero ? "text-[#13B5EA]" : "text-[#0F172A]"}`}>
                    {step.label}
                  </div>
                </LightCard>
                {index < workflowSteps.length - 1 ? (
                  <ArrowRight className="hidden shrink-0 text-[#7C3AED]/50 sm:block" size={18} />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Client Value */}
      <section id="value" className={`relative z-10 py-14 sm:py-16 ${M.pageMuted}`}>
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <div className={M.sectionLabel}>Client Value</div>
            <h2 className={`mt-3 text-3xl sm:text-4xl ${M.heading}`}>
              Outcomes your finance and operations teams can measure
            </h2>
            <p className={`mt-4 text-sm leading-7 sm:text-base ${M.muted}`}>
              VYRON COST is an AI cost intelligence, procurement control and inventory accuracy platform — Xero-ready for
              finance teams who need truth in margin, not spreadsheets.
            </p>
          </div>
          <div className="grid gap-3 sm:gap-4">
            {clientOutcomes.map((outcome) => (
              <div key={outcome} className={`flex items-start gap-3 p-4 ${M.lightCard}`}>
                <CheckCircle2 className="mt-0.5 shrink-0 text-[#7C3AED]" size={20} />
                <span className={`text-sm leading-6 ${M.body}`}>{outcome}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="mb-8 text-center sm:mb-10">
          <div className={M.eyebrow}>
            <Wallet size={14} />
            Packages
          </div>
          <h2 className={`mt-5 text-3xl sm:text-4xl lg:text-5xl ${M.heading}`}>
            Premium intelligence for serious operators
          </h2>
          <p className={`mx-auto mt-4 max-w-2xl text-sm leading-7 sm:text-base ${M.muted}`}>
            Editable package placeholders — scale from costing foundation to enterprise multi-company control.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {pricingPlans.map((plan) => {
            const Icon = plan.icon;
            return (
              <LightCard
                key={plan.name}
                className={`relative flex flex-col p-6 ${plan.popular ? M.pricingPopular : ""}`}
              >
                {plan.popular ? <div className={`absolute right-5 top-5 ${M.statusRecommended}`}>Recommended</div> : null}

                <div className={`h-12 w-12 ${M.iconEmphasis}`}>
                  <Icon size={24} />
                </div>

                <div className={`mt-5 text-xs font-bold uppercase tracking-[0.14em] ${M.sectionLabel}`}>{plan.tag}</div>
                <h3 className={`mt-1 text-2xl sm:text-3xl ${M.heading}`}>{plan.name}</h3>

                <div className="mt-4 flex items-end gap-1">
                  <div className={`text-4xl tracking-[-0.04em] sm:text-5xl ${M.accentKpiGradient}`}>{plan.price}</div>
                  {plan.price !== "Custom" ? (
                    <div className={`pb-1 text-sm font-semibold ${M.muted}`}>/month</div>
                  ) : null}
                </div>

                <p className={`mt-4 min-h-[4.5rem] text-sm leading-6 ${M.muted}`}>{plan.description}</p>

                <div className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <div key={feature} className={`flex items-start gap-2.5 text-sm ${M.body}`}>
                      <CheckCircle2 className="mt-0.5 shrink-0 text-[#7C3AED]/70" size={16} />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <Link
                  href="/login"
                  className={`mt-6 w-full px-5 py-3.5 text-xs uppercase tracking-[0.1em] sm:text-sm ${
                    plan.popular ? M.primaryBtn : M.secondaryBtn
                  }`}
                >
                  Get Started <ArrowRight size={16} />
                </Link>
              </LightCard>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-6 sm:pb-20">
        <div className={`relative overflow-hidden rounded-[2rem] p-8 sm:rounded-[2.5rem] sm:p-12 ${M.darkPanel}`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(244,63,94,0.08),transparent_42%)]" />
          <div className="relative text-center">
            <div className={`inline-flex items-center gap-2 ${M.statusBrand}`}>
              <Users size={14} />
              For procurement, finance &amp; operations leaders
            </div>
            <h2 className={`mt-6 text-3xl sm:text-4xl lg:text-5xl ${M.headingOnDark}`}>Ready to control your true cost?</h2>
            <p className={`mx-auto mt-4 max-w-2xl text-sm leading-7 sm:text-base ${M.mutedOnDark}`}>
              Join manufacturers and multi-site operators using VYRON COST for AI cost intelligence, procurement control
              and finished goods profitability.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/login"
                className={`${M.primaryBtn} px-7 py-4 text-xs uppercase tracking-[0.1em] sm:text-sm`}
              >
                Start VYRON COST <ArrowRight size={18} />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-7 py-4 text-xs font-bold uppercase tracking-[0.1em] text-[#F8FAFC] sm:text-sm"
              >
                Book a Demo
              </Link>
            </div>
          </div>
        </div>

        <footer className={`mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-[#E2E8F0] pt-8 text-xs font-medium ${M.muted}`}>
          <div>© {new Date().getFullYear()} VYRON COST — AI Cost Intelligence Platform</div>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-[#0F172A]">
              Sign In
            </Link>
            <a href="#pricing" className="hover:text-[#0F172A]">
              Pricing
            </a>
          </div>
        </footer>
      </section>
    </main>
  );
}
