"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { demoSampleLabel } from "@/lib/vyron-demo-data";
import { isActiveClientDemoMode } from "@/lib/vyron-workspace-context";

export default function DemoSampleBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isActiveClientDemoMode());
    const refresh = () => setShow(isActiveClientDemoMode());
    window.addEventListener("vyron-active-client-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("vyron-active-client-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-[#A855F7]/30 bg-gradient-to-r from-[#07110d] via-[#0d1f18] to-[#07110d] p-5 shadow-[0_20px_60px_rgba(6,20,14,0.28)] md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#A855F7]/12 text-[#A855F7]">
          <Sparkles size={22} />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-[#A855F7]">Enterprise platform · Live demo</div>
          <div className="mt-1 text-xl font-black text-white">VYRON COST</div>
          <div className="mt-1 text-sm text-slate-400">{demoSampleLabel} · Food manufacturing, restaurants, franchises & multi-branch ops.</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/recovery-opportunities" className="rounded-full bg-gradient-to-r from-[#A855F7] to-[#84CC16] px-4 py-2 text-xs font-black text-[#F8FAFC]">
          Recovery
        </Link>
        <Link href="/financial-leakage" className="rounded-full bg-[#A855F7]/12 px-4 py-2 text-xs font-black text-[#A855F7]">
          Leakage
        </Link>
        <Link href="/action-centre" className="rounded-full bg-[#A855F7]/12 px-4 py-2 text-xs font-black text-[#A855F7]">
          Actions
        </Link>
      </div>
    </div>
  );
}
