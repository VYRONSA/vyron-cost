import { ArrowRight, LayoutDashboard, TrendingUp } from "lucide-react";
import Link from "next/link";
import ClientBrandLockup from "@/components/ClientBrandLockup";

const kpiStrip = [
  { label: "Recoverable Profit", value: "R1.38M" },
  { label: "Products Under Margin Pressure", value: "14" },
  { label: "Supplier Inflation Detected", value: "12.4%" },
  { label: "Invoice Risks Identified", value: "3" },
];

const features = [
  {
    title: "Supplier inflation detection",
    body: "Track price movement, negotiation opportunity and supplier risk before margin erodes.",
  },
  {
    title: "BOM costing",
    body: "Build recipes with ingredient, packaging, labour and wastage lines linked to finished products.",
  },
  {
    title: "Product GP protection",
    body: "Monitor selling price, BOM cost, target GP and suggested repricing actions.",
  },
  {
    title: "Invoice intelligence",
    body: "Upload or email supplier invoices, extract lines and flag duplicate invoice risk.",
  },
  {
    title: "Purchase order intelligence",
    body: "Create POs, track variance and connect procurement to supplier intelligence.",
  },
  {
    title: "Recovery opportunities",
    body: "Every recovery value shows the formula: avoidable monthly loss × 12.",
  },
  {
    title: "Document upload & email intake",
    body: "Document Intelligence extracts supplier, invoice number, lines and approval workflow.",
  },
  {
    title: "Reports & forecasting",
    body: "Margin, supplier movement, cost variance and 30/60/90-day GP forecast.",
  },
];

export default function VyronLandingPage() {
  return (
    <main className="min-h-screen bg-[#F7F8FA] text-[#0F172A]">
      <header className="sticky top-0 z-20 border-b border-[#E2E8F0] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#08111A] text-xs font-black text-[#B6D934]">
              VC
            </div>
            <div>
              <div className="text-sm font-black">VYRON COST</div>
              <div className="text-[9px] font-black uppercase tracking-[0.24em] text-[#64748B]">Profit Protection</div>
            </div>
          </Link>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="rounded-xl border border-[#E2E8F0] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#64748B]"
            >
              Login
            </Link>
            <Link
              href="/login"
              className="hidden rounded-xl border border-[#E2E8F0] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#64748B] md:inline-flex"
            >
              Book Demo
            </Link>
            <Link
              href="/api/demo-access?redirect=/dashboard"
              className="rounded-xl bg-[#B6D934] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#08111A]"
            >
              View Demo
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(182,217,52,0.12),transparent_45%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-12 pt-16 lg:grid-cols-2 lg:items-center lg:px-10 lg:pt-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#64748B]">
              <TrendingUp size={14} className="text-[#B6D934]" />
              Enterprise Costing & Profit Protection
            </div>
            <h1 className="text-5xl font-black leading-[1.02] tracking-tight md:text-6xl lg:text-7xl">
              VYRON COST
              <br />
              <span className="text-[#08111A]">PROTECTS MARGIN</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-[#64748B]">
              VYRON COST is built for food manufacturers, multi-site producers and finance teams who need live BOM
              costing, supplier intelligence, invoice and PO control, and explainable profit recovery — not spreadsheets.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#08111A] px-8 py-4 text-sm font-black uppercase tracking-[0.12em] text-white"
              >
                Login
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-8 py-4 text-sm font-black uppercase tracking-[0.12em] text-[#0F172A]"
              >
                Book Demo
              </Link>
              <Link
                href="/api/demo-access?redirect=/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#B6D934] px-8 py-4 text-sm font-black uppercase tracking-[0.12em] text-[#08111A]"
              >
                View Demo
                <LayoutDashboard size={18} />
              </Link>
            </div>
          </div>

          <div className="vyron-surface-card-elevated overflow-hidden p-8">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#64748B]">What VYRON COST does</div>
            <div className="mt-6 space-y-4">
              {[
                { emoji: "🔴", title: "Meat supplier inflation detected", sub: "+12.4% on protein lines" },
                { emoji: "🔴", title: "Chicken Pie margin below target", sub: "GP gap · repricing required" },
                { emoji: "🟠", title: "Packaging costs increasing", sub: "Spend concentration flagged" },
                { emoji: "🟢", title: "Opportunity to recover R324k", sub: "Formula shown on drilldown" },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                  <div className="flex items-start gap-3">
                    <span>{item.emoji}</span>
                    <div>
                      <div className="font-black">{item.title}</div>
                      <div className="mt-1 text-sm text-[#64748B]">{item.sub}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#E2E8F0] bg-white">
        <div className="mx-auto grid max-w-7xl gap-px md:grid-cols-4">
          {kpiStrip.map((item) => (
            <div key={item.label} className="px-6 py-8 text-center md:py-10">
              <div className="text-3xl font-black text-[#0F172A] md:text-4xl">{item.value}</div>
              <div className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#64748B]">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <h2 className="text-3xl font-black">Built for real costing operations</h2>
        <p className="mt-3 max-w-3xl text-[#64748B]">
          From supplier master and ingredient yield through BOM build, finished product GP, document intake and recovery
          approval — every module connects in one SaaS workflow.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => (
            <div key={feature.title} className="vyron-surface-card-elevated p-6">
              <h3 className="font-black text-[#08111A]">{feature.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#64748B]">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-8 lg:px-10">
        <div className="vyron-surface-card-elevated flex flex-col gap-8 p-10 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#64748B]">Demo client</div>
            <h2 className="mt-3 text-3xl font-black">Handcrafted Food Products</h2>
            <p className="mt-2 text-[#64748B]">Live costing intelligence · powered by VYRON COST</p>
          </div>
          <ClientBrandLockup variant="light" size="lg" />
        </div>
      </section>

      <section id="cta" className="mx-auto max-w-7xl px-6 pb-24 lg:px-10">
        <div className="rounded-[2rem] bg-[#08111A] p-12 text-center text-white">
          <h2 className="text-3xl font-black md:text-4xl">This software finds money — and shows the formula.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-white/70">
            Email invoices and purchase orders directly to VYRON COST and let AI extract, match and flag risks.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-[#B6D934] px-8 py-4 text-sm font-black uppercase tracking-[0.12em] text-[#08111A]"
            >
              Login
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-8 py-4 text-sm font-black uppercase tracking-[0.12em] text-white"
            >
              Book Demo
            </Link>
            <Link
              href="/api/demo-access?redirect=/dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-8 py-4 text-sm font-black uppercase tracking-[0.12em] text-white"
            >
              View Demo
              <LayoutDashboard size={18} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E2E8F0] py-8 text-center text-[10px] font-black uppercase tracking-[0.2em] text-[#64748B]">
        Handcrafted Food Products · powered by VYRON COST
      </footer>
    </main>
  );
}
