"use client";

import Link from "next/link";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const manualSections = [
  { n: 1, title: "Login", body: "Open /login, enter demo credentials and enter the command centre." },
  { n: 2, title: "Company setup", body: "Confirm tenant banner shows Handcrafted Food Products and target GP defaults." },
  { n: 3, title: "Add suppliers", body: "Operations → Suppliers → add supplier with category, risk and contact details." },
  { n: 4, title: "Add ingredients", body: "Operations → Ingredients → capture purchase cost, yield % and true unit cost." },
  { n: 5, title: "Bulk import ingredients", body: "Master Data → Import Centre → open the required import workflow, download template, upload CSV, validate and import." },
  { n: 6, title: "Create finished products", body: "Operations → Products → add finished product with selling price and target GP." },
  { n: 7, title: "Build BOMs", body: "Recipes & BOM → open recipe edit → add ingredient, packaging, labour and wastage lines." },
  { n: 8, title: "Link BOM to product", body: "Open product detail → link BOM/recipe → update cost from BOM and review GP." },
  { n: 9, title: "Add purchase orders", body: "Purchase Orders → create PO with supplier, lines, totals and notes." },
  { n: 10, title: "Upload supplier invoices", body: "Document Intelligence → upload invoice PDF/image and approve extracted lines." },
  { n: 11, title: "Review supplier intelligence", body: "Intelligence → Supplier Intelligence → review movement, variance and negotiation opportunity." },
  { n: 12, title: "Review product GP", body: "Product Performance → identify below-target GP products and open product detail." },
  { n: 13, title: "Review recovery opportunities", body: "Recovery → open each opportunity to see formula, monthly and annual value." },
  { n: 14, title: "Approve recommended actions", body: "Use Approve / Investigating / Reject on recovery detail and action centre items." },
  { n: 15, title: "Use reports", body: "Reports → launch margin, supplier movement, cost variance and forecast reports." },
  { n: 16, title: "Use AI assistant", body: "AI Assistant → ask margin, supplier, recovery and invoice questions from live data." },
  { n: 17, title: "Month-end workflow", body: "Review GP, supplier movement, PO variance, invoice forensics and recovery pipeline." },
  { n: 18, title: "Demo workflow for Handcrafted Food Products", body: "Dashboard → Products → Recipes → Suppliers → Recovery → Document Intelligence → Reports." },
];

export default function TrainingManualClient() {
  return (
    <VyronPremiumPageShell
      config={{
        title: "Training Manual",
        subtitle: "Premium VYRON COST workflow for training manual.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-[#F8FAFC]">VYRON COST Training Manual</h2>
                  <p className="mt-2 text-sm text-slate-500">Step-by-step guide for client demo and month-end workflow.</p>
                </div>
                <a
                  href="/api/training-manual"
                  className="rounded-xl bg-[#08111A] px-5 py-3 text-sm font-black text-[#B6D934]"
                >
                  Download Full Training Manual PDF
                </a>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {manualSections.map((section) => (
                <div key={section.n} className="rounded-[2rem] border border-white bg-white p-5 shadow-sm">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-[#65A30D]">Step {section.n}</div>
                  <h3 className="mt-2 text-lg font-black text-[#F8FAFC]">{section.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{section.body}</p>
                </div>
              ))}
            </div>

            <div className="rounded-[2rem] bg-[#08111A] p-6 text-white">
              <h3 className="text-lg font-black text-[#B6D934]">Quick links for training</h3>
              <div className="mt-4 flex flex-wrap gap-3 text-sm font-black">
                <Link href="/products" className="rounded-full bg-white/10 px-4 py-2">Products</Link>
                <Link href="/recipes" className="rounded-full bg-white/10 px-4 py-2">Recipes & BOM</Link>
                <Link href="/import-centre" className="rounded-full bg-white/10 px-4 py-2">Import Centre</Link>
                <Link href="/document-intelligence" className="rounded-full bg-white/10 px-4 py-2">Document Intelligence</Link>
                <Link href="/recovery-opportunities" className="rounded-full bg-white/10 px-4 py-2">Recovery</Link>
              </div>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
