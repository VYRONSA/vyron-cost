"use client";

import type { TenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import {
  VyronPremiumEmptyState,
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumIntelligencePanel,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";
import { VYRON_SURFACE } from "@/components/vyron-ui";

function money(value: number) {
  return `R${value.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function AiCostIntelligenceClient({
  intelligence,
}: {
  intelligence: TenantCostIntelligence | null;
}) {
  if (!intelligence) {
    return (
      <section className="grid gap-8">
        <VyronPremiumHeroBanner
          visualVariant="executive"
          badge="Premium Cost Intelligence"
          title="Cost Intelligence Centre"
          subtitle="AI-driven margin erosion, supplier inflation, BOM movement and repricing signals."
          outcomes={[
            "Surface products below target GP",
            "Highlight supplier inflation exposure",
            "Show BOM cost movement impact",
          ]}
          quotes={[{ label: "Margin", quote: "Small cost leaks become large financial problems." }]}
        />
        <VyronPremiumEmptyState
          steps={[
            "Load products with BOM links and target GP.",
            "Capture supplier and ingredient cost movement.",
            "Process invoices and production runs.",
            "Re-open cost intelligence once data is available.",
          ]}
        />
      </section>
    );
  }

  return (
    <div className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="executive"
        badge="Premium Cost Intelligence"
        title="Cost Intelligence Centre"
        subtitle="Margin erosion, supplier inflation, BOM cost movement and repricing recovery — ranked for action."
        outcomes={[
          "See products eroding target margin",
          "Rank supplier inflation by monthly exposure",
          "Track BOM cost movement on key products",
          "Act on suggested repricing and recovery value",
        ]}
        quotes={[
          { label: "Cost control", quote: "Small cost leaks become large financial problems." },
          { label: "Margin", quote: "Revenue is vanity. Margin is sanity." },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <VyronPremiumFormulaCard
          eyebrow="Margin"
          title="Cost intelligence formulas"
          formulas={[
            { label: "GP Gap", formula: "Target GP% − Actual GP%" },
            { label: "Monthly Risk", formula: "GP gap × monthly unit volume × unit price" },
            { label: "BOM Movement", formula: "(Current BOM cost − Prior BOM cost) ÷ Prior × 100" },
          ]}
        />
        <VyronPremiumIntelligencePanel
          title="Margin Intelligence"
          items={[
            { label: "Erosion", detail: "Products below target GP are leaking margin on every sale." },
            { label: "Inflation", detail: "Supplier movement flows into BOM cost unless repriced or renegotiated." },
            { label: "Recovery", detail: "Suggested repricing quantifies monthly wealth recovery potential." },
          ]}
        />
      </div>

      <VyronPremiumSectionHeading eyebrow="Signals" title="Margin erosion" subtitle="Products where actual gross profit sits below target." />

      <section className={`${VYRON_SURFACE.dark} p-6`}>
        <div className="space-y-3">
          {intelligence.marginErosion.slice(0, 8).map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3">
              <div>
                <div className="font-black text-[#F8FAFC]">{row.product_name}</div>
                <div className="text-xs font-semibold text-red-300">GP gap {row.gp_gap}% · Target {row.target_gp}%</div>
              </div>
              <div className="text-sm font-black text-red-300">{money(Number(row.monthly_risk_value || 0))}/month</div>
            </div>
          ))}
          {!intelligence.marginErosion.length ? (
            <div className="text-sm font-semibold text-[#CBD5E1]">No margin erosion detected on current product set.</div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className={`${VYRON_SURFACE.dark} p-6`}>
          <h2 className="text-xl font-black text-[#F8FAFC]">Supplier inflation</h2>
          <div className="mt-4 space-y-3">
            {intelligence.supplierInflation.slice(0, 8).map((row) => (
              <div key={row.supplierName} className="rounded-xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-4 py-3">
                <div className="font-black text-[var(--vyron-warning-fg)]">{row.supplierName}</div>
                <div className="text-sm font-semibold text-[var(--vyron-warning-fg)]">
                  {row.movementPct}% · {row.category} · Exposure {money(row.monthlyExposure)}/month
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${VYRON_SURFACE.dark} p-6`}>
          <h2 className="text-xl font-black text-[#F8FAFC]">BOM cost movement</h2>
          <div className="mt-4 space-y-3">
            {intelligence.bomCostMovement.slice(0, 8).map((row) => (
              <div key={row.productName} className="rounded-xl border border-violet-400/30 bg-violet-500/15 px-4 py-3">
                <div className="font-black text-violet-200">{row.productName}</div>
                <div className="text-sm font-semibold text-violet-300">
                  {money(row.previousCost)} → {money(row.currentCost)} · {row.movementPct}% · {row.impact}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#A855F7]/20 bg-[#252040] p-6 shadow-sm">
        <h2 className="text-xl font-black text-[#F8FAFC]">Suggested repricing & recovery</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {intelligence.repricingSuggestions.map((row) => (
            <div key={row.productName} className="rounded-xl border border-white/12 bg-[#1e1635] px-4 py-3">
              <div className="font-black text-[#F8FAFC]">{row.productName}</div>
              <div className="text-sm font-semibold text-[#CBD5E1]">
                Suggested price {money(row.suggestedPrice)} from {money(row.currentPrice)}
              </div>
              <div className="mt-1 text-sm font-bold text-[#A855F7]">Recovery {money(row.monthlyRecovery)}/month</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
