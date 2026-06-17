"use client";

import { Bell, BrainCircuit, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { isActiveClientDemoMode } from "@/lib/vyron-workspace-context";

export default function ExecutiveTopBar() {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    setDemo(isActiveClientDemoMode());
    const refresh = () => setDemo(isActiveClientDemoMode());
    window.addEventListener("vyron-active-client-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("vyron-active-client-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <div className="mb-6 grid gap-4 xl:grid-cols-[1fr_auto]">
      <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        <Search size={20} className="text-[#64748B]" />
        <input
          placeholder="Search products, suppliers, invoices, threats..."
          className="w-full bg-transparent text-sm font-semibold text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4 text-xs font-black uppercase tracking-[0.12em] text-[#0F172A] shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <BrainCircuit size={18} className="text-[#B6D934]" />
          {demo ? "Live Intelligence" : "Workspace Active"}
        </div>
        <button
          type="button"
          className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-[#E2E8F0] bg-white text-[#0F172A] shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
        >
          <Bell size={20} />
        </button>
      </div>
    </div>
  );
}
