import Link from "next/link";
import VyronSurfaceCard, { formatExecutiveMoney } from "@/components/VyronSurfaceCard";
import { LeakageKpis } from "@/lib/vyron-financial-command-data";

function buildThreats(kpis: LeakageKpis) {
  return [
    { id: "th-supplier", title: "Supplier inflation", riskScore: 86, impact: kpis.supplierInflationExposure, status: "Active", href: "/supplier-inflation", tone: "danger" as const },
    { id: "th-margin", title: "Product margin collapse", riskScore: 82, impact: kpis.productsBelowGp, status: "Open", href: "/product-profitability", tone: "danger" as const },
    { id: "th-invoice", title: "Invoice anomalies", riskScore: 74, impact: kpis.duplicateInvoiceRisks, status: "Investigate", href: "/invoice-forensics", tone: "warning" as const },
    { id: "th-spike", title: "Cost spikes", riskScore: 69, impact: kpis.wastageLosses, status: "Review", href: "/financial-leakage", tone: "warning" as const },
    { id: "th-proc", title: "Procurement risks", riskScore: 77, impact: kpis.procurementAnomalies, status: "Open", href: "/procurement-risk", tone: "warning" as const },
  ];
}

export default function ThreatCentrePanel({ kpis }: { kpis: LeakageKpis }) {
  const threats = buildThreats(kpis);

  return (
    <section id="threat-centre">
      <div className="mb-2 flex items-center justify-between">
        <div className="vyron-section-label">Threat Centre</div>
        <Link href="/financial-leakage" className="text-[10px] font-black uppercase tracking-[0.12em] text-[#64748B]">Detail →</Link>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {threats.map((threat) => (
          <Link key={threat.id} href={threat.href}>
            <VyronSurfaceCard className="h-full p-3">
              <div className="flex items-start justify-between gap-1">
                <div className="text-[11px] font-black leading-tight text-[#0F172A]">{threat.title}</div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${threat.tone === "danger" ? "bg-[#FEE2E2] text-[#EF4444]" : "bg-[#FEF3C7] text-[#F59E0B]"}`}>
                  {threat.riskScore}
                </span>
              </div>
              <div className="mt-2 text-sm font-black text-[#0F172A]">{formatExecutiveMoney(threat.impact)}</div>
              <div className="mt-1 text-[10px] font-bold text-[#64748B]">{threat.status}</div>
            </VyronSurfaceCard>
          </Link>
        ))}
      </div>
    </section>
  );
}
