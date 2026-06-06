import { Sparkles } from "lucide-react";
import Link from "next/link";
import { demoSampleLabel, shouldUseDemoData } from "@/lib/vyron-demo-data";

export default function DemoSampleBanner() {
  if (!shouldUseDemoData()) return null;

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-emerald-400/25 bg-gradient-to-r from-[#07110d] via-[#0d1f18] to-[#07110d] p-5 shadow-[0_20px_60px_rgba(6,20,14,0.28)] md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
          <Sparkles size={22} />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Enterprise platform · Live demo</div>
          <div className="mt-1 text-xl font-black text-white">VYRON COST</div>
          <div className="mt-1 text-sm text-slate-400">{demoSampleLabel} · Food manufacturing, restaurants, franchises & multi-branch ops.</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/recovery-opportunities" className="rounded-full bg-gradient-to-r from-emerald-300 to-green-400 px-4 py-2 text-xs font-black text-[#07110d]">
          Recovery
        </Link>
        <Link href="/financial-leakage" className="rounded-full bg-emerald-400/15 px-4 py-2 text-xs font-black text-emerald-300">
          Leakage
        </Link>
        <Link href="/action-centre" className="rounded-full bg-emerald-400/15 px-4 py-2 text-xs font-black text-emerald-300">
          Actions
        </Link>
      </div>
    </div>
  );
}
