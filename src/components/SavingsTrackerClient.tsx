"use client";

import { useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const startingRows = [
  ["Supplier negotiation", 18500],
  ["Pricing approval", 22400],
  ["Wastage reduction", 8400],
  ["Duplicate invoice blocked", 18420],
];

export default function SavingsTrackerClient() {
  const [rows, setRows] = useState(startingRows);
  const [name, setName] = useState("");
  const [value, setValue] = useState("0");

  function add() {
    if (!name.trim()) return;
    setRows((current) => [[name.trim(), Number(value || 0)], ...current]);
    setName("");
    setValue("0");
  }

  const total = rows.reduce((sum, row) => sum + Number(row[1] || 0), 0);

  return (
    <VyronPremiumPageShell
      config={{
        title: "Savings Tracker",
        subtitle: "Premium VYRON COST workflow for savings tracker.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">Savings Tracked</div>
              <div className="mt-3 text-5xl font-black">{money(total)}</div>
            </div>
            <div className="rounded-[2rem] bg-white p-6">
              <div className="grid gap-3 md:grid-cols-[1fr_160px_140px]">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Saving item..." className="rounded-2xl border px-4 py-3 font-bold" />
                <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="rounded-2xl border px-4 py-3 font-bold" />
                <button onClick={add} className="rounded-2xl border border-transparent vyron-grad-surface px-5 py-3 font-black text-[#F8FAFC]">Add</button>
              </div>
            </div>
            <div className="grid gap-3">
              {rows.map(([label, amount]) => (
                <div key={String(label)} className="flex justify-between rounded-[2rem] bg-white p-5 font-black">
                  <span>{label}</span>
                  <span className="text-[#7E22CE]">{money(Number(amount))}</span>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
