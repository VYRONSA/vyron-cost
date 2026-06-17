"use client";

import { CheckCircle2, Plus } from "lucide-react";
import { useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const startingTasks = [
  ["Confirm supplier master list", "Suppliers", "High"],
  ["Load first 10 pie BOMs", "BOM", "High"],
  ["Approve price changes", "Pricing", "High"],
  ["Review invoice queue", "Invoices", "Medium"],
  ["Run executive dashboard", "Demo", "Medium"],
];

export default function ClientTaskCentreClient() {
  const [tasks, setTasks] = useState(startingTasks);
  const [title, setTitle] = useState("");
  const [done, setDone] = useState<Record<string, boolean>>({});

  function addTask() {
    if (!title.trim()) return;
    setTasks((current) => [[title.trim(), "General", "Medium"], ...current]);
    setTitle("");
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="flex gap-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add client task..." className="flex-1 rounded-2xl border px-4 py-3 font-bold outline-none" />
          <button onClick={addTask} className="inline-flex items-center gap-2 rounded-2xl border border-[#A3E635]/30 bg-[#24183F] px-5 py-3 font-black text-[#F8FAFC]"><Plus size={17} /> Add</button>
        </div>
      </div>

      <div className="grid gap-4">
        {tasks.map(([task, area, priority]) => {
          const checked = Boolean(done[task]);
          return (
    <VyronPremiumPageShell
      config={{
        title: "Client Task Centre",
        subtitle: "Premium VYRON COST workflow for client task centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div key={task} className="grid gap-4 rounded-[2rem] bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)] md:grid-cols-[60px_1fr_140px_120px] md:items-center">
                    <button onClick={() => setDone((current) => ({ ...current, [task]: !checked }))} className={`flex h-12 w-12 items-center justify-center rounded-2xl ${checked ? "bg-[#A3E635]/100 text-white" : "bg-slate-100 text-slate-400"}`}>
                      <CheckCircle2 size={24} />
                    </button>
                    <div>
                      <div className="font-black text-[#F8FAFC]">{task}</div>
                      <div className="text-xs font-bold text-slate-500">{area}</div>
                    </div>
                    <div className="font-black text-amber-700">{priority}</div>
                    <div className={checked ? "font-black text-[#65A30D]" : "font-black text-slate-500"}>{checked ? "Done" : "Open"}</div>
                  </div>
    </VyronPremiumPageShell>
  );
        })}
      </div>
    </section>
  );
}
