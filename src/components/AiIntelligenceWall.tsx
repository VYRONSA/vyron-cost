import Link from "next/link";
import { FileSearch, LineChart, Package, Percent, Sparkles, TrendingUp } from "lucide-react";
import VyronSurfaceCard, { formatCompactAnnual, formatExecutiveMoney } from "@/components/VyronSurfaceCard";
import { AiFinancialFeedItem, LeakageKpis } from "@/lib/vyron-financial-command-data";

function buildCards(kpis: LeakageKpis, feed: AiFinancialFeedItem[]) {
  const supplierFeed = feed.find((f) => /supplier|inflation|meat|protein/i.test(f.headline));
  const productFeed = feed.find((f) => /gp|margin|product|pie|chicken/i.test(f.headline));

  return [
    { title: "Supplier Inflation", metric: supplierFeed ? formatExecutiveMoney(supplierFeed.lossAmount) : formatCompactAnnual(kpis.supplierInflationExposure), href: "/supplier-inflation", icon: TrendingUp, tone: "text-[#EF4444]" },
    { title: "Product GP Collapse", metric: formatExecutiveMoney(kpis.productsBelowGp), href: "/product-profitability", icon: Percent, tone: "text-[#EF4444]" },
    { title: "Packaging Cost Trend", metric: formatExecutiveMoney(kpis.procurementAnomalies), href: "/procurement-risk", icon: Package, tone: "text-[#C026D3]" },
    { title: "Recipe Optimisation", metric: formatExecutiveMoney(kpis.wastageLosses), href: "/recipes", icon: Sparkles, tone: "text-[#9333EA]" },
    { title: "Duplicate Invoice Detection", metric: formatExecutiveMoney(kpis.duplicateInvoiceRisks), href: "/invoice-forensics", icon: FileSearch, tone: "text-[#C026D3]" },
    { title: "Supplier Variance", metric: formatCompactAnnual(kpis.supplierInflationExposure), href: "/supplier-intelligence", icon: LineChart, tone: "text-[#0F172A]" },
  ].map((c) => ({
    ...c,
    detail: productFeed?.detail?.slice(0, 48) || "Live intelligence signal",
  }));
}

export default function AiIntelligenceWall({ kpis, feed }: { kpis: LeakageKpis; feed: AiFinancialFeedItem[] }) {
  const cards = buildCards(kpis, feed);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div className="vyron-section-label">AI Intelligence Wall</div>
        <Link href="/financial-leakage" className="text-[10px] font-black uppercase tracking-[0.12em] text-[#64748B]">Full →</Link>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.title} href={card.href}>
              <VyronSurfaceCard className="h-full p-3 transition hover:shadow-md">
                <div className="flex items-center gap-2">
                  <Icon size={14} className={card.tone} />
                  <div className="truncate text-[10px] font-black uppercase tracking-[0.08em] text-[#64748B]">{card.title}</div>
                </div>
                <div className={`mt-2 text-lg font-black leading-none ${card.tone}`}>{card.metric}</div>
              </VyronSurfaceCard>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
