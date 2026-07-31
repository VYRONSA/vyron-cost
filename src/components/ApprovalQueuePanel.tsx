import Link from "next/link";
import { buildHandcraftedIntelligence } from "@/lib/vyron-handcrafted-intelligence";

export default async function ApprovalQueuePanel() {
  const intel = await buildHandcraftedIntelligence();
  const below = intel?.productIntel.filter((p) => Number(p.gp_gap || 0) > 0) ?? [];

  const approvals =
    below.length > 0
      ? below.slice(0, 4).map((p) => ({
          type: "GP OVERRIDE",
          item: `${p.product_name} below target GP`,
          risk: String(p.risk_level || "HIGH").toUpperCase(),
        }))
      : [{ type: "NO ACTIONS", item: "All products within band", risk: "LOW" }];

  return (
    <section className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.22em] text-[#7E22CE]">APPROVALS</div>
          <h2 className="mt-2 text-2xl font-black text-[#F8FAFC]">Pending Queue</h2>
        </div>
        <div className="rounded-full bg-red-50 px-4 py-2 text-xs font-black text-red-700">ACTION REQUIRED</div>
      </div>

      <div className="mt-6 space-y-4">
        {approvals.map((approval) => (
          <div key={approval.item} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{approval.type}</div>
                <div className="mt-2 text-sm font-black text-[#F8FAFC]">{approval.item}</div>
              </div>
              <div
                className={`rounded-full px-4 py-2 text-xs font-black ${
                  approval.risk === "CRITICAL"
                    ? "bg-red-100 text-red-700"
                    : approval.risk === "HIGH"
                      ? "bg-fuchsia-100 text-fuchsia-700"
                      : "bg-[#A855F7]/12 text-[#7E22CE]"
                }`}
              >
                {approval.risk}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/approvals"
        className="mt-6 inline-flex rounded-full bg-[#07110d] px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#A855F7]"
      >
        Open Approvals
      </Link>
    </section>
  );
}
