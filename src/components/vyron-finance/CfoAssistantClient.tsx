"use client";

import { useState } from "react";
import type { CfoAssistantAnswer } from "@/lib/vyron-finance-intelligence-layer";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function CfoAssistantClient({ presets }: { presets: CfoAssistantAnswer[] }) {
  const [question, setQuestion] = useState(presets[0]?.question || "");
  const [answer, setAnswer] = useState<CfoAssistantAnswer | null>(presets[0] || null);
  const [busy, setBusy] = useState(false);

  async function ask(q: string) {
    setQuestion(q);
    setBusy(true);
    try {
      const res = await fetch("/api/vyron-finance/cfo-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (data.ok) setAnswer(data.answer);
    } finally {
      setBusy(false);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "finance",
        title: "Cfo Assistant",
        subtitle: "Premium VYRON COST workflow for cfo assistant.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="font-black">Suggested questions</h2>
              <div className="mt-4 flex flex-col gap-2">
                {presets.map((p) => (
                  <button
                    key={p.question}
                    type="button"
                    disabled={busy}
                    onClick={() => ask(p.question)}
                    className="rounded-xl bg-white px-4 py-3 text-left text-sm font-bold text-slate-800 shadow-sm hover:bg-violet-50 disabled:opacity-50"
                  >
                    {p.question}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-[2rem] bg-slate-950 p-8 text-white">
              <h2 className="text-xl font-black">AI CFO Assistant</h2>
              {answer ? (
                <>
                  <p className="mt-2 text-sm text-violet-300">{answer.question}</p>
                  <p className="mt-4 text-sm leading-8 text-slate-200">{answer.answer}</p>
                  <div className="mt-6 rounded-xl bg-white/10 p-4 text-xs font-bold text-slate-300">
                    <div>Formula: {answer.formula}</div>
                    <div className="mt-1">Confidence: {answer.confidence}%</div>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-slate-400">Select a question for a data-driven response.</p>
              )}
              <label className="mt-6 block">
                <span className="text-xs font-black uppercase text-slate-500">Custom question</span>
                <div className="mt-2 flex gap-2">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
                  />
                  <button
                    type="button"
                    disabled={busy || !question.trim()}
                    onClick={() => ask(question)}
                    className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-black disabled:opacity-50"
                  >
                    Ask
                  </button>
                </div>
              </label>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
