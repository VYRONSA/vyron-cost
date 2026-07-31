import { ArrowUpRight, BrainCircuit, Radio } from "lucide-react";
import Link from "next/link";
import VyronSurfaceCard from "@/components/VyronSurfaceCard";
import { formatMoney } from "@/lib/vyron-cost-data";
import { AiFinancialFeedItem } from "@/lib/vyron-financial-command-data";

type Signal = "critical" | "high" | "recover" | "medium";

function resolveSignal(item: AiFinancialFeedItem): { emoji: string; signal: Signal } {
  const headline = item.headline.toLowerCase();
  if (item.recoverableAmount > 0 && item.lossAmount === 0) return { emoji: "🟢", signal: "recover" };
  if (/opportunity|recover/i.test(headline)) return { emoji: "🟢", signal: "recover" };
  if (/critical/i.test(item.severity) || /anomaly|duplicate/i.test(headline)) {
    return { emoji: "🔴", signal: "critical" };
  }
  if (/high/i.test(item.severity) || /inflation|margin|below|supplier|meat|chicken|packaging/i.test(headline)) {
    return { emoji: "🟠", signal: "high" };
  }
  return { emoji: "🟠", signal: "medium" };
}

const signalStyles = {
  critical: "border-[#FECACA] bg-[#FEF2F2]",
  high: "border-[#FDE68A] bg-[#FFFBEB]",
  recover: "border-[#DDD6FE] bg-[#F0FDF4]",
  medium: "border-[#E2E8F0] bg-[#F8FAFC]",
};

export default function AiFinancialIntelligenceFeed({ items }: { items: AiFinancialFeedItem[] }) {
  const totalLoss = items.reduce((sum, item) => sum + item.lossAmount, 0);
  const totalRecoverable = items.reduce((sum, item) => sum + item.recoverableAmount, 0);

  return (
    <section className="min-w-0">
      <VyronSurfaceCard elevated className="overflow-hidden p-0">
        <div className="border-b border-[#E2E8F0] px-8 py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#08111A]">
                <BrainCircuit size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#64748B]">
                  <Radio size={12} />
                  AI Financial Intelligence
                </div>
                <h2 className="mt-1 text-2xl font-black text-[#0F172A]">Intelligence Timeline</h2>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-5 py-4">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#EF4444]">Exposure</div>
                <div className="mt-1 text-lg font-black text-[#0F172A]">{formatMoney(totalLoss)}</div>
              </div>
              <div className="rounded-2xl border border-[#DDD6FE] bg-[#F0FDF4] px-5 py-4">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9333EA]">Recoverable</div>
                <div className="mt-1 text-lg font-black text-[#9333EA]">{formatMoney(totalRecoverable)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-6 md:p-8">
          {items.map((item) => {
            const { emoji, signal } = resolveSignal(item);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`group block rounded-2xl border p-5 transition hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)] ${signalStyles[signal]}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <span className="text-xl">{emoji}</span>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#64748B]">{item.time}</div>
                      <div className="mt-1 text-lg font-black text-[#0F172A]">{item.headline}</div>
                      <div className="mt-1 text-sm text-[#64748B]">{item.detail}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {item.lossAmount > 0 && (
                      <div className="text-sm font-black text-[#EF4444]">{formatMoney(item.lossAmount)}</div>
                    )}
                    {item.recoverableAmount > 0 && (
                      <div className="text-sm font-black text-[#9333EA]">{formatMoney(item.recoverableAmount)}</div>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.12em] text-[#64748B] group-hover:text-[#0F172A]">
                      {item.action}
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </VyronSurfaceCard>
    </section>
  );
}
