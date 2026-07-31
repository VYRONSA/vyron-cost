"use client";

import Link from "next/link";
import { useState } from "react";
import type { WorkforceSimulationRow } from "@/lib/vyron-workforce-digital-twin";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const SCENARIO_TYPES = [
  { value: "overtime", label: "Overtime reduction", param: "overtimeReductionPct", default: 15 },
  { value: "headcount", label: "Headcount change", param: "headcountDelta", default: 2 },
  { value: "attrition", label: "Attrition scenario", param: "attritionRatePct", default: 8 },
  { value: "field_coverage", label: "Field coverage", param: "additionalReps", default: 2 },
  { value: "travel_reduction", label: "Travel reduction", param: "travelReductionPct", default: 10 },
] as const;

function money(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatOutput(key: string, value: unknown) {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  if (/cost|saving|delta|exposure|claim/i.test(key) && Math.abs(n) > 100) return money(n);
  return n.toFixed(1);
}

export default function VyronCoreSimulationClient({ initialSimulations }: { initialSimulations: WorkforceSimulationRow[] }) {
  const [simulations, setSimulations] = useState(initialSimulations);
  const [scenarioType, setScenarioType] = useState<(typeof SCENARIO_TYPES)[number]["value"]>("overtime");
  const [paramValue, setParamValue] = useState(15);
  const [scenarioName, setScenarioName] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = SCENARIO_TYPES.find((s) => s.value === scenarioType) || SCENARIO_TYPES[0];

  async function runSimulation() {
    setRunning(true);
    setMessage(null);
    const res = await fetch("/api/vyron-core/simulations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioName: scenarioName || selected.label,
        scenarioType,
        params: { [selected.param]: paramValue },
      }),
    });
    const data = await res.json();
    setRunning(false);
    if (!data.ok) {
      setMessage(data.error || "Simulation failed.");
      return;
    }
    setSimulations((current) => [data.simulation, ...current]);
    setMessage("Simulation completed and saved.");
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "VYRON CORE",
        title: "Workforce Simulation Centre",
        subtitle: "Run what-if workforce scenarios to evaluate cost, attrition, and productivity outcomes.",
        outcomes: ["Test policy and staffing decisions safely", "Compare scenario outputs in one workspace", "Build data-backed workforce action plans"],
        formulas: ["Scenario Output = Model(scenario type, parameter)", "Cost metrics formatted for finance decisions", "Simulation history preserves run metadata"],
        intelligenceItems: [
          { label: "Scenario templates", detail: `${SCENARIO_TYPES.length} predefined simulation types` },
          { label: "History depth", detail: `${simulations.length} simulations available for review` },
          { label: "Current mode", detail: selected.label },
        ],
      }}
    >
      <section className="grid gap-8">
        <div className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-violet-950 to-indigo-950 p-8 text-white">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">VYRON CORE</div>
        <h2 className="mt-2 text-3xl font-black">Simulation Engine</h2>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">
          What-if workforce scenarios — overtime, headcount, attrition, field coverage and travel reduction.
        </p>
      </div>

      {message ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">{message}</div>
      ) : null}

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h3 className="text-xl font-black text-slate-950">Run new simulation</h3>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-black text-slate-600">
            Scenario type
            <select
              value={scenarioType}
              onChange={(e) => {
                const next = SCENARIO_TYPES.find((s) => s.value === e.target.value);
                setScenarioType(e.target.value as (typeof SCENARIO_TYPES)[number]["value"]);
                if (next) setParamValue(next.default);
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none"
            >
              {SCENARIO_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-black text-slate-600">
            {selected.param}
            <input
              type="number"
              value={paramValue}
              onChange={(e) => setParamValue(Number(e.target.value))}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none"
            />
          </label>
          <label className="text-sm font-black text-slate-600 md:col-span-2">
            Scenario name (optional)
            <input
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder={selected.label}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void runSimulation()}
          disabled={running}
          className="mt-5 rounded-2xl bg-violet-700 px-6 py-3 text-sm font-black text-[#F8FAFC] disabled:opacity-60"
        >
          {running ? "Running…" : "Run simulation"}
        </button>
      </section>

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h3 className="text-xl font-black text-slate-950">Simulation history</h3>
        <div className="mt-5 space-y-4">
          {simulations.length === 0 ? (
            <p className="text-sm font-semibold text-slate-500">No simulations yet.</p>
          ) : (
            simulations.map((sim) => (
              <div key={sim.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-black text-slate-900">{sim.scenarioName}</div>
                    <div className="text-xs font-semibold text-slate-500">
                      {sim.scenarioType.replace(/_/g, " ")} · {new Date(sim.createdAt).toLocaleString("en-ZA")}
                    </div>
                  </div>
                  <span className="rounded-full bg-[#A855F7]/12 px-3 py-1 text-xs font-black text-[#4D7C0F]">{sim.status}</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(sim.outputResults).map(([key, value]) => (
                    <div key={key} className="rounded-xl bg-white px-3 py-2 text-sm">
                      <div className="text-[10px] font-black uppercase text-slate-400">{key.replace(/([A-Z])/g, " $1")}</div>
                      <div className="font-black text-violet-700">{formatOutput(key, value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

        <Link href="/vyron-core/command-centre" className="inline-flex w-fit rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">
        ← Back to Executive Command Centre
        </Link>
      </section>
    </VyronPremiumPageShell>
  );
}
