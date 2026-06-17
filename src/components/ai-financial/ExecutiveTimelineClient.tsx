"use client";

import Link from "next/link";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import type { ExecutiveTimelineEvent } from "@/lib/vyron-ai-financial-intelligence";

const CATEGORY_COLORS: Record<string, string> = {
  "Supplier Change": "bg-violet-100 text-violet-900",
  Recovery: "bg-[#A3E635]/12 text-[#4D7C0F]",
  "Risk Alert": "bg-red-100 text-red-900",
  Approval: "bg-amber-100 text-amber-900",
};

export default function ExecutiveTimelineClient({ events }: { events: ExecutiveTimelineEvent[] }) {
  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "executive",
        badge: "Executive Timeline",
        title: "Executive Timeline Intelligence",
        subtitle: "Track critical financial, risk, and approval events in chronological sequence.",
        outcomes: ["Align leadership on event chronology", "Expose category-based operational signals", "Link directly to source records"],
        formulas: ["Timeline ordered by event timestamp", "Category highlighting by event type", "Action path from timeline event to record"],
        intelligenceItems: [
          { label: "Event stream", detail: `${events.length} executive events in current timeline` },
          { label: "Category coverage", detail: "Supplier change, recovery, risk, and approvals in one stream" },
        ],
      }}
    >
      <section className="relative border-l-2 border-slate-200 pl-8">
        {events.map((e) => (
        <article key={e.id} className="relative mb-8 pb-2">
          <span className="absolute -left-[2.05rem] top-1 h-4 w-4 rounded-full border-4 border-white bg-violet-600 shadow" />
          <time className="text-xs font-bold text-slate-400">{new Date(e.at).toLocaleString("en-ZA")}</time>
          <span
            className={`ml-3 inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${CATEGORY_COLORS[e.category] || "bg-slate-100 text-slate-800"}`}
          >
            {e.category}
          </span>
          <h3 className="mt-2 font-black text-slate-900">{e.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{e.detail}</p>
          {e.href ? (
            <Link href={e.href} className="mt-2 inline-block text-xs font-black text-violet-700">
              Open record →
            </Link>
          ) : null}
        </article>
        ))}
      </section>
    </VyronPremiumPageShell>
  );
}
