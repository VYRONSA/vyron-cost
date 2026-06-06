import { buildHandcraftedIntelligence } from "@/lib/vyron-handcrafted-intelligence";

export default async function OperationalTimeline() {
  const intel = await buildHandcraftedIntelligence();
  const feed = intel?.aiFeed ?? [];

  const items =
    feed.length > 0
      ? feed.map((item) => ({
          title: item.headline.toUpperCase(),
          detail: item.detail,
          time: item.time,
        }))
      : [{ title: "AWAITING DATA", detail: "Connect Supabase to load Handcrafted costing.", time: "—" }];

  return (
    <section className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_20px_60px_rgba(6,20,14,0.28)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">LIVE OPERATIONS</div>
          <h2 className="mt-2 text-2xl font-black">Operational Timeline</h2>
        </div>
        <div className="rounded-full bg-emerald-400/15 px-4 py-2 text-xs font-black text-emerald-300">LIVE</div>
      </div>

      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <div key={item.title} className="rounded-[1.5rem] border border-emerald-400/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-black tracking-[0.08em] text-white">{item.title}</div>
                <div className="mt-2 text-sm leading-7 text-slate-300">{item.detail}</div>
              </div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">{item.time}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
