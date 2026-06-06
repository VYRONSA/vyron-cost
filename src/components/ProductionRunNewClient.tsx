"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type BomOption = {
  id: string;
  bom_name: string;
  yield_qty: number;
  yield_unit: string;
  total_cost: number;
  cost_per_unit: number;
};

export default function ProductionRunNewClient() {
  const router = useRouter();
  const [boms, setBoms] = useState<BomOption[]>([]);
  const [bomId, setBomId] = useState("");
  const [batchMultiplier, setBatchMultiplier] = useState("1");
  const [plannedQty, setPlannedQty] = useState("");
  const [notes, setNotes] = useState("");
  const [labourHours, setLabourHours] = useState("2");
  const [labourRate, setLabourRate] = useState("85");
  const [overheadType, setOverheadType] = useState("Factory Overheads");
  const [overheadMethod, setOverheadMethod] = useState("Per Run");
  const [overheadAmount, setOverheadAmount] = useState("120");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/production/boms")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setBoms(d.boms);
      });
  }, []);

  const selected = boms.find((b) => b.id === bomId);

  async function createRun() {
    if (!bomId) {
      setError("Select a recipe / BOM.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/production/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bom_id: bomId,
        batch_multiplier: Number(batchMultiplier) || 1,
        planned_qty: plannedQty ? Number(plannedQty) : undefined,
        notes,
        labour: [{ hours: Number(labourHours), rate: Number(labourRate) }],
        overhead: [
          {
            overhead_type: overheadType,
            allocation_method: overheadMethod,
            amount: Number(overheadAmount),
            percent_value: overheadMethod === "Percentage" ? Number(overheadAmount) : undefined,
          },
        ],
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.ok) {
      setError(data.error || "Create failed");
      return;
    }
    router.push(`/manufacturing/runs/${data.run.id}`);
  }

  return (
    <section className="grid max-w-3xl gap-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <label className="text-xs font-black uppercase tracking-[0.12em] text-violet-600">Recipe / BOM *</label>
        <select
          value={bomId}
          onChange={(e) => setBomId(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
        >
          <option value="">Select BOM…</option>
          {boms.map((b) => (
            <option key={b.id} value={b.id}>
              {b.bom_name} (yield {b.yield_qty} {b.yield_unit || "unit"})
            </option>
          ))}
        </select>
        {selected ? (
          <p className="mt-2 text-sm font-semibold text-slate-600">
            BOM cost {selected.total_cost?.toFixed(2)} · {selected.cost_per_unit?.toFixed(2)} per unit
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-black uppercase text-slate-500">Batch multiplier</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={batchMultiplier}
              onChange={(e) => setBatchMultiplier(e.target.value)}
              className="mt-1 w-full rounded-xl border px-4 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-black uppercase text-slate-500">Planned output qty (optional)</label>
            <input
              type="number"
              value={plannedQty}
              onChange={(e) => setPlannedQty(e.target.value)}
              placeholder={selected ? String(Number(selected.yield_qty) * Number(batchMultiplier || 1)) : ""}
              className="mt-1 w-full rounded-xl border px-4 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-black uppercase text-slate-500">Direct labour (hours)</label>
            <input type="number" value={labourHours} onChange={(e) => setLabourHours(e.target.value)} className="mt-1 w-full rounded-xl border px-4 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-black uppercase text-slate-500">Labour rate (R/hr)</label>
            <input type="number" value={labourRate} onChange={(e) => setLabourRate(e.target.value)} className="mt-1 w-full rounded-xl border px-4 py-2 text-sm" />
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-black uppercase text-slate-500">Overhead type</label>
            <select value={overheadType} onChange={(e) => setOverheadType(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
              <option>Electricity</option>
              <option>Rent</option>
              <option>Factory Overheads</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-black uppercase text-slate-500">Allocation</label>
            <select value={overheadMethod} onChange={(e) => setOverheadMethod(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
              <option>Per Unit</option>
              <option>Per Run</option>
              <option>Percentage</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-black uppercase text-slate-500">Amount / %</label>
            <input type="number" value={overheadAmount} onChange={(e) => setOverheadAmount(e.target.value)} className="mt-1 w-full rounded-xl border px-4 py-2 text-sm" />
          </div>
        </div>

        <div className="mt-6">
          <label className="text-xs font-black uppercase text-slate-500">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border px-4 py-2 text-sm" />
        </div>

        {error ? <p className="mt-4 text-sm font-bold text-red-600">{error}</p> : null}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void createRun()}
            className="rounded-2xl bg-violet-700 px-6 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create Production Run"}
          </button>
          <Link href="/manufacturing/runs" className="rounded-2xl border px-6 py-3 text-sm font-black text-slate-700">
            Cancel
          </Link>
        </div>
      </div>
    </section>
  );
}
