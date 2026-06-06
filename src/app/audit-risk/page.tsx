import { Activity, ShieldAlert, Siren } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import StatusPill from "@/components/StatusPill";
import VyronCostShell from "@/components/VyronCostShell";
import { getAuditLog, statusTone } from "@/lib/vyron-cost-data";

export default async function AuditRiskPage() {
  const audit = await getAuditLog();
  const highRisk = audit.filter((event) => statusTone(event.risk_level) === "red").length;

  return (
    <VyronCostShell
      title="Audit & Risk"
      subtitle="Track changes to recipes, supplier prices, yield rules, approvals and high-risk margin decisions."
    >
      <section className="mb-6 grid gap-5 md:grid-cols-3">
        <MetricCard title="Audit Events" value={String(audit.length)} note="Tracked system actions" icon={Activity} />
        <MetricCard title="High Risk Events" value={String(highRisk)} note="Needs manager review" icon={Siren} />
        <MetricCard title="Audit Trail" value="Active" note="Compliance-ready foundation" icon={ShieldAlert} dark />
      </section>

      <section className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-2xl font-black text-[#07110d]">Risk Event Log</h2>
        <div className="mt-6 space-y-4">
          {audit.map((event) => (
            <div key={event.id} className="rounded-3xl border border-slate-100 bg-[#f9fcf9] p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-black text-[#07110d]">{event.event_type}: {event.entity_name}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">{event.event_detail}</div>
                </div>
                <StatusPill tone={statusTone(event.risk_level)}>{event.risk_level}</StatusPill>
              </div>
            </div>
          ))}
        </div>
      </section>
    </VyronCostShell>
  );
}
