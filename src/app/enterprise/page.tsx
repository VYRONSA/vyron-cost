import Link from "next/link";
import {
  AlertTriangle,
  BrainCircuit,
  Gauge,
  MailCheck,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";

import ApprovalQueuePanel from "@/components/ApprovalQueuePanel";
import EnterpriseDocumentMetrics from "@/components/EnterpriseDocumentMetrics";
import EnterpriseMetricCard from "@/components/EnterpriseMetricCard";
import ExecutiveTopBar from "@/components/ExecutiveTopBar";
import OperationalTimeline from "@/components/OperationalTimeline";
import VyronCostShell from "@/components/VyronCostShell";
import { getDocumentIntelligenceStats } from "@/lib/vyron-document-intelligence-data";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export default async function EnterprisePage() {
  let awaitingReview = 0;
  let archiveCount = 0;
  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        const stats = await getDocumentIntelligenceStats(supabase);
        awaitingReview = stats.awaitingReview;
        archiveCount = stats.archiveCount;
      } catch {
        /* stats optional for demo shell */
      }
    }
  }

  return (
    <VyronCostShell
      title="Enterprise Intelligence"
      subtitle="LIVE PROFIT PROTECTION"
    >
      <ExecutiveTopBar />

      <section className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <EnterpriseMetricCard
          title="Money At Risk"
          value="R184,520"
          note="Margin exposure"
          icon={ShieldAlert}
          dark
        />

        <EnterpriseMetricCard
          title="GP Risk Products"
          value="14"
          note="Below target GP"
          icon={AlertTriangle}
        />

        <Link href="/document-intelligence">
          <EnterpriseMetricCard
            title="Invoice Queue"
            value={String(awaitingReview)}
            note="Awaiting approval"
            icon={MailCheck}
          />
        </Link>

        <EnterpriseMetricCard
          title="Supplier Movement"
          value="+12.4%"
          note="Average inflation"
          icon={TrendingUp}
        />
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <OperationalTimeline />
        <ApprovalQueuePanel />
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_20px_60px_rgba(6,20,14,0.28)]">
          <div className="rounded-2xl bg-emerald-400/15 p-3 text-emerald-300 w-fit">
            <BrainCircuit size={24} />
          </div>

          <div className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
            INVOICE AI
          </div>

          <div className="mt-2 text-3xl font-black">
            ACTIVE
          </div>

          <div className="mt-4 text-sm leading-7 text-slate-300">
            Supplier extraction and pricing intelligence operational. {archiveCount} invoices archived.
          </div>
          <EnterpriseDocumentMetrics />
        </div>

        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 w-fit">
            <Gauge size={24} />
          </div>

          <div className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
            YIELD ENGINE
          </div>

          <div className="mt-2 text-3xl font-black text-[#07110d]">
            68 RULES
          </div>

          <div className="mt-4 text-sm leading-7 text-slate-500">
            Cooked yield, prep loss and shrinkage tracking enabled.
          </div>
        </div>

        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="rounded-2xl bg-red-50 p-3 text-red-700 w-fit">
            <AlertTriangle size={24} />
          </div>

          <div className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-red-700">
            GP ALERTS
          </div>

          <div className="mt-2 text-3xl font-black text-[#07110d]">
            14 PRODUCTS
          </div>

          <div className="mt-4 text-sm leading-7 text-slate-500">
            Products below minimum margin threshold.
          </div>
        </div>
      </section>
    </VyronCostShell>
  );
}
