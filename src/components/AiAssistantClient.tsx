"use client";

import { Sparkles, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { AiAnswer, answerVyronQuestion, suggestedQuestions } from "@/lib/vyron-ai-assistant";

export default function AiAssistantClient() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [isPending, startTransition] = useTransition();

  function ask(selected?: string) {
    const prompt = selected || question;
    if (!prompt.trim()) return;
    startTransition(async () => {
      const result = await answerVyronQuestion(prompt);
      setAnswer(result);
      setQuestion(prompt);
    });
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "AI Intelligence",
        title: "AI Assistant Command Centre",
        subtitle: "Query live margin, supplier, and cost intelligence through a guided executive assistant interface.",
        outcomes: ["Accelerate financial insight discovery", "Generate actionable recommendation cards", "Route users directly to corrective workflows"],
        formulas: ["Answer Summary synthesized from live domain context", "Recommendation Tone reflects risk/opportunity priority", "Impact values tied to module-specific insight outputs"],
        intelligenceItems: [
          { label: "Prompt library", detail: `${suggestedQuestions.length} suggested intelligence prompts` },
          { label: "Response state", detail: answer ? "Answer generated" : "Awaiting question" },
          { label: "Action routing", detail: "Recommendation cards link to relevant modules" },
        ],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl vyron-grad-deep text-[#DDD6FE]">
            <Sparkles size={22} />
          </div>
          <div>
            <h2 className="vyron-t-title text-2xl text-[#0F172A]">VYRON AI Workspace</h2>
            <p className="text-sm text-slate-500">Ask profit, margin, supplier and recipe questions using live costing data.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") ask();
            }}
            placeholder="Ask VYRON anything about margin, suppliers, recipes..."
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-4 text-sm font-bold outline-none focus:border-[#A78BFA]"
          />
          <button
            type="button"
            onClick={() => ask()}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-2xl vyron-grad-deep px-5 py-4 text-sm font-black text-[#DDD6FE] disabled:opacity-60"
          >
            <WandSparkles size={18} />
            Ask
          </button>
        </div>

        <div className="mt-5">
          <div className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Suggested questions</div>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => ask(item)}
                className="rounded-full border border-[#A855F7]/25 bg-[#A855F7]/10 px-4 py-2 text-xs font-black text-[#7E22CE] transition hover:bg-[#A855F7]/15"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h3 className="vyron-t-title text-xl text-[#0F172A]">Answer Panel</h3>
        {!answer ? (
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-8 text-sm font-bold text-slate-500">
            Select a suggested question or type your own to generate recommendations from live Supabase data.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl vyron-grad-deep p-5 text-white">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#DDD6FE]">Summary</div>
              <div className="mt-2 text-lg font-black">{answer.summary}</div>
            </div>
            <div>
              <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Key findings</div>
              <ul className="space-y-2">
                {answer.bullets.map((bullet) => (
                  <li key={bullet} className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

        {answer ? (
        <div className="xl:col-span-2 rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <h3 className="vyron-t-title text-xl text-[#0F172A]">Recommendation Cards</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {answer.recommendations.map((item) => (
              <Link
                key={`${item.title}-${item.href}`}
                href={item.href}
                className={`rounded-2xl border p-5 transition hover:-translate-y-0.5 ${
                  item.tone === "red"
                    ? "border-red-200 bg-red-50"
                    : item.tone === "amber"
                      ? "border-fuchsia-200 bg-fuchsia-50"
                      : "border-[#A855F7]/25 bg-[#A855F7]/10"
                }`}
              >
                <div className="vyron-t-title text-[#0F172A]">{item.title}</div>
                <div className="mt-2 text-sm text-slate-600">{item.detail}</div>
                <div className="mt-3 text-lg font-black text-violet-700">{item.impact}</div>
              </Link>
            ))}
          </div>
        </div>
        ) : null}
      </section>
    </VyronPremiumPageShell>
  );
}
