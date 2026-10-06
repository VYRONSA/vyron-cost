"use client";

import Link from "next/link";
import { ArrowRight, Factory } from "lucide-react";
import type { AttentionCentre, AttentionItem } from "@/lib/vyron-attention-centre";

const DOT: Record<AttentionItem["severity"], string> = { critical: "bg-rose-500", warning: "bg-amber-500", info: "bg-sky-500" };
const AREA: Record<AttentionItem["area"], string> = { STOCK: "Stock", SUPPLIER_INVOICES: "Supplier invoices", PRODUCTION: "Production", SALES: "Sales" };

function whenText(iso: string) {
  const date = new Date(iso);
  return {
    day: date.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" }),
    time: date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" }),
  };
}

/** "Attention Required" and "Last Production" — counts of real records, each linking to where they are. */
export default function DashboardAttentionPanel({ attention }: { attention: AttentionCentre | null }) {
  if (!attention) return null;
  const { items, production } = attention;
  const last = production.last ? whenText(production.last.completedAt) : null;
  return (
    <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <div className="rounded-2xl border border-[#E8EDF2] bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[1.05rem] font-black tracking-[-0.01em] text-[#0B202B]">Attention Required</h2>
          <span className="text-xs font-semibold text-[#64748B]">{items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : "All clear"}</span>
        </div>
        {items.length ? (
          <ul className="mt-4 grid gap-2">
            {items.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="group flex items-center justify-between gap-3 rounded-xl border border-[#EEF2F6] px-4 py-3 transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC]">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[item.severity]}`} aria-label={item.severity} />
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-[#0B202B]">{item.label}</span>
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8]">{AREA[item.area]}</span>
                    </span>
                  </span>
                  <ArrowRight size={15} className="shrink-0 text-[#94A3B8] transition group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm font-semibold text-[#64748B]">Nothing needs attention right now.</p>
        )}
      </div>

      <div className="rounded-2xl border border-[#E8EDF2] bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[1.05rem] font-black tracking-[-0.01em] text-[#0B202B]">Last Production Processed</h2>
          <Factory size={18} className="text-[#94A3B8]" aria-hidden />
        </div>
        {production.last && last ? (
          <Link href={`/manufacturing/runs/${production.last.runId}`} className="mt-4 block rounded-xl border border-[#EEF2F6] px-4 py-3 transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC]">
            <span className="block text-2xl font-black text-[#0B202B]">{last.day}</span>
            <span className="block text-sm font-black text-[#0B202B]">{last.time}</span>
            <span className="mt-2 block text-sm font-semibold text-[#475569]">
              {production.last.runNumber}
              {production.last.productName ? ` · ${production.last.productName}` : ""} · {production.last.quantity.toLocaleString("en-ZA")} units
            </span>
            <span className="block text-sm font-semibold text-[#475569]">Processed by {production.last.completedBy || "—"}</span>
          </Link>
        ) : (
          <p className="mt-4 text-sm font-semibold text-[#64748B]">No production has been completed yet.</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#F8FAFC] px-4 py-3">
            <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">Production today</span>
            <span className="block text-lg font-black text-[#0B202B]">{production.unitsToday.toLocaleString("en-ZA")} units</span>
          </div>
          <div className="rounded-xl bg-[#F8FAFC] px-4 py-3">
            <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">Runs today</span>
            <span className="block text-lg font-black text-[#0B202B]">{production.runsToday}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
