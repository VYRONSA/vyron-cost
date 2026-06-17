"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Brain,
  CheckSquare,
  Gavel,
  LineChart,
  MessageSquare,
  RefreshCcw,
  Search,
  Shield,
  Sparkles,
  TrendingDown,
  Wallet,
} from "lucide-react";
import {
  buildIntelligenceSourceStatuses,
  SUGGESTED_QUESTION_GROUPS,
  type AskVyronAnswer,
  type IntelligenceSourceStatus,
} from "@/lib/vyron-ask-vyron";
import type { RecipeQualityStats } from "@/lib/vyron-early-warning";
import type { RecipeRecord } from "@/lib/vyron-cost-recipes-data";
import type { ExecutiveCommandCentrePayload } from "@/lib/vyron-executive-command-centre";
import type { TenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import type { XeroConnectionState } from "@/lib/vyron-xero-integration";
import type { DecisionConfidence } from "@/lib/vyron-decisions";
import { VYRON_MASTER } from "@/components/vyron-ui";

const M = VYRON_MASTER;

type InvoiceSummary = {
  monthlySales: number;
  monthlyGpPct: number;
  invoiceCount: number;
  uniqueCustomers: number;
};

type SessionEntry = {
  id: string;
  question: string;
  answer: AskVyronAnswer;
  askedAt: string;
};

function currentPeriodLabel() {
  return new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function computeRecipeQuality(recipes: RecipeRecord[]): RecipeQualityStats {
  const totalRecipes = recipes.length;
  const recipesWithoutLines = recipes.filter((row) => !row.lines?.length).length;
  const recipesWithoutCosting = recipes.filter((row) => !Number(row.total_cost)).length;
  return { totalRecipes, recipesWithoutLines, recipesWithoutCosting };
}

export default function AskVyronClient({
  intelligence,
  companyName,
  hasWorkspace,
}: {
  intelligence: TenantCostIntelligence | null;
  companyName: string;
  hasWorkspace: boolean;
}) {
  const [commandData, setCommandData] = useState<ExecutiveCommandCentrePayload | null>(null);
  const [xeroConnection, setXeroConnection] = useState<XeroConnectionState | null>(null);
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary | null>(null);
  const [recipeQuality, setRecipeQuality] = useState<RecipeQualityStats | null>(null);
  const [invoiceSyncReady, setInvoiceSyncReady] = useState(false);
  const [xeroQueueFailed, setXeroQueueFailed] = useState(0);
  const [xeroQueueReady, setXeroQueueReady] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState<AskVyronAnswer | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionEntry[]>([]);

  const refresh = useCallback(() => {
    if (!hasWorkspace) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    Promise.all([
      fetch("/api/executive/command-centre").then((r) => r.json()),
      fetch("/api/integrations/xero/connection").then((r) => r.json()),
      fetch("/api/integrations/xero/sync-queue").then((r) => r.json()),
      fetch("/api/integrations/xero/mapping").then((r) => r.json()),
      fetch("/api/customer-invoices").then((r) => r.json()),
      fetch("/api/recipes").then((r) => r.json()),
    ])
      .then(([commandRes, xeroRes, queueRes, mappingRes, invoiceRes, recipesRes]) => {
        if (commandRes.ok && commandRes.data) {
          setCommandData(commandRes.data as ExecutiveCommandCentrePayload);
        } else {
          setCommandData(null);
        }

        if (xeroRes.ok) {
          setXeroConnection(xeroRes.connection || null);
        } else {
          setXeroConnection(null);
        }

        if (queueRes.ok && Array.isArray(queueRes.items)) {
          const items = queueRes.items as Array<{ status: string }>;
          setXeroQueueFailed(items.filter((row) => row.status === "Failed").length);
          setXeroQueueReady(items.filter((row) => row.status === "Ready").length);
        } else {
          setXeroQueueFailed(0);
          setXeroQueueReady(0);
        }

        if (mappingRes.ok) {
          setInvoiceSyncReady(Boolean(mappingRes.invoiceSyncReady));
        }

        if (recipesRes.ok && Array.isArray(recipesRes.recipes)) {
          setRecipeQuality(computeRecipeQuality(recipesRes.recipes as RecipeRecord[]));
        } else {
          setRecipeQuality(null);
        }

        if (invoiceRes.ok && Array.isArray(invoiceRes.invoices)) {
          const posted = invoiceRes.invoices.filter(
            (inv: {
              status?: string;
              stock_posted?: boolean;
              invoice_date?: string;
              customer_id?: string | null;
              customer_name?: string;
            }) => {
              const status = String(inv.status || "");
              const postedStatus = inv.stock_posted || ["Posted", "Sent", "Paid"].includes(status);
              if (!postedStatus || !inv.invoice_date) return false;
              return new Date(inv.invoice_date) >= monthStart;
            }
          );
          const monthlySales = posted.reduce(
            (sum: number, inv: { sales_value?: number }) => sum + Number(inv.sales_value || 0),
            0
          );
          const gpWeighted = posted.reduce(
            (acc: { sales: number; gp: number }, inv: { sales_value?: number; gross_profit?: number }) => {
              const sales = Number(inv.sales_value || 0);
              return { sales: acc.sales + sales, gp: acc.gp + Number(inv.gross_profit || 0) };
            },
            { sales: 0, gp: 0 }
          );
          const uniqueCustomers = new Set(
            posted.map((inv: { customer_id?: string | null; customer_name?: string }) =>
              String(inv.customer_id || inv.customer_name || "")
            )
          ).size;

          setInvoiceSummary({
            monthlySales,
            monthlyGpPct: gpWeighted.sales > 0 ? (gpWeighted.gp / gpWeighted.sales) * 100 : 0,
            invoiceCount: posted.length,
            uniqueCustomers,
          });
        } else {
          setInvoiceSummary(null);
        }

        setLastRefresh(new Date().toISOString());
      })
      .catch(() => setLoadError("Could not load intelligence sources for Ask VYRON."))
      .finally(() => setLoading(false));
  }, [hasWorkspace]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sourceStatuses: IntelligenceSourceStatus[] = useMemo(
    () =>
      buildIntelligenceSourceStatuses({
        intelligence,
        commandData,
        xeroConnection,
        invoiceSummary,
        invoiceSyncReady,
        xeroQueueFailed,
        xeroQueueReady,
        recipeQuality,
      }),
    [
      intelligence,
      commandData,
      xeroConnection,
      invoiceSummary,
      invoiceSyncReady,
      xeroQueueFailed,
      xeroQueueReady,
      recipeQuality,
    ]
  );

  const intelligenceReady = sourceStatuses.some((row) => row.available);
  const availableSourceCount = sourceStatuses.filter((row) => row.available).length;

  const submitQuestion = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || asking) return;

      setQuestion(trimmed);
      setAsking(true);
      setAskError(null);

      try {
        const res = await fetch("/api/ask-vyron", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Ask VYRON request failed.");
        }
        const answer = data.answer as AskVyronAnswer;
        setCurrentAnswer(answer);
        setSessionHistory((prev) => [
          {
            id: `session-${Date.now()}`,
            question: trimmed,
            answer,
            askedAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 8));
      } catch (error) {
        setAskError(error instanceof Error ? error.message : "Ask VYRON request failed.");
      } finally {
        setAsking(false);
      }
    },
    [asking]
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void submitQuestion(question);
  };

  const quickChips = [
    "What is hurting my margin?",
    "What should we fix first?",
    "Which suppliers are risky?",
    "What are my top actions?",
  ];

  return (
    <div className="space-y-6">
      <header className={M.moduleHeaderNavy}>
        <div className={`relative p-1 md:p-2 ${M.dashboardHeroInner}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#F43F5E]/35 bg-[#F43F5E]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#FECDD3]">
                VYRON Intelligence Assistant
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Ask VYRON</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                Ask your business what is happening, why it is happening, and what to do next — for{" "}
                <span className="font-bold text-white">{companyName}</span> · {currentPeriodLabel()}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Intelligence sources: <span className="text-white">{availableSourceCount}/8 ready</span>
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Status:{" "}
                  <span className="text-white">
                    {!hasWorkspace ? "No workspace" : intelligenceReady ? "Ready" : "Needs data"}
                  </span>
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Last refresh:{" "}
                  <span className="text-white">
                    {lastRefresh
                      ? new Date(lastRefresh).toLocaleString("en-ZA", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : loading
                        ? "Loading…"
                        : "—"}
                  </span>
                </span>
              </div>
            </div>
            <button type="button" onClick={refresh} className={`shrink-0 ${M.secondaryBtn} px-4 py-2 text-sm`}>
              <RefreshCcw size={16} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {loadError}
        </div>
      ) : null}

      {!hasWorkspace ? (
        <section className={M.moduleDataSection}>
          <h2 className="text-xl font-bold text-[#0F172A]">Select an active workspace</h2>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Ask VYRON answers from the active company workspace only. Log in to a company workspace or select a client
            from Developer → Clients.
          </p>
          <div className="mt-5">
            <Link href="/dashboard" className={`${M.primaryBtn} px-4 py-2 text-sm`}>
              Go to Dashboard
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className={M.moduleDataSection}>
            <div className="flex items-start gap-3">
              <Sparkles size={20} className="mt-0.5 shrink-0 text-[#7C3AED]" />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-[#0F172A]">Ask a business question</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Deterministic answers from workspace intelligence — not generative AI.
                </p>
                <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    rows={3}
                    placeholder="Ask: What is hurting margin? · What should we fix first? · Which suppliers are risky? · What are my top actions?"
                    className="w-full rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-medium text-[#0F172A] shadow-sm outline-none transition focus:border-[#7C3AED]/40 focus:ring-2 focus:ring-[#7C3AED]/15"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      disabled={asking || !question.trim()}
                      className={`${M.primaryBtn} px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <Brain size={16} />
                      {asking ? "Analysing…" : "Ask VYRON"}
                    </button>
                    {quickChips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          setQuestion(chip);
                          void submitQuestion(chip);
                        }}
                        className="rounded-full border border-[#E2E8F0] bg-[#F6F7FB] px-3 py-1.5 text-xs font-semibold text-[#334155] transition hover:border-[#7C3AED]/30 hover:text-[#7C3AED]"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </form>
                {askError ? (
                  <p className="mt-3 text-sm font-semibold text-rose-700">{askError}</p>
                ) : null}
              </div>
            </div>
          </section>

          {currentAnswer ? (
            <section className={M.moduleDataSection}>
              <div className="flex flex-wrap items-center gap-2">
                <MessageSquare size={18} className="text-[#7C3AED]" />
                <h2 className="text-xl font-bold text-[#0F172A]">Answer</h2>
                <ConfidenceBadge confidence={currentAnswer.confidence} />
                {currentAnswer.insufficientData ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                    Needs data
                  </span>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl border border-[#7C3AED]/20 bg-[#7C3AED]/5 p-5">
                <p className="text-base font-bold leading-7 text-[#0F172A]">{currentAnswer.answer}</p>
                <p className="mt-3 text-sm font-medium leading-6 text-[#475569]">{currentAnswer.summary}</p>
              </div>

              {currentAnswer.evidence.length > 0 ? (
                <div className="mt-5">
                  <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#64748B]">Evidence</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {currentAnswer.evidence.map((item) => (
                      <div key={`${item.label}-${item.value}`} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7C3AED]">{item.label}</div>
                        <p className="mt-1 text-sm font-semibold text-[#0F172A]">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {currentAnswer.relatedRisks.length > 0 ? (
                <div className="mt-5">
                  <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#64748B]">Related risks</h3>
                  <ul className="mt-2 space-y-1 text-sm font-medium text-[#334155]">
                    {currentAnswer.relatedRisks.map((risk) => (
                      <li key={risk}>· {risk}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {currentAnswer.recommendedActions.length > 0 ? (
                <div className="mt-5">
                  <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#64748B]">Recommended next steps</h3>
                  <ul className="mt-2 space-y-1 text-sm font-medium text-[#334155]">
                    {currentAnswer.recommendedActions.map((action) => (
                      <li key={action}>· {action}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {currentAnswer.drilldowns.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {currentAnswer.drilldowns.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] bg-[#F6F7FB] px-4 py-2 text-sm font-semibold text-[#334155] transition hover:border-[#7C3AED]/30 hover:text-[#7C3AED]"
                    >
                      {link.label}
                      <ArrowRight size={14} />
                    </Link>
                  ))}
                </div>
              ) : null}

              <p className="mt-4 text-xs font-medium text-[#94A3B8]">
                Sources: {currentAnswer.sourceModules.join(" · ")}
              </p>
            </section>
          ) : null}

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Suggested questions</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Common executive questions grouped by intelligence domain.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {SUGGESTED_QUESTION_GROUPS.map((group) => (
                <div key={group.id} className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                  <h3 className="font-bold text-[#0F172A]">{group.label}</h3>
                  <div className="mt-3 space-y-2">
                    {group.questions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setQuestion(q);
                          void submitQuestion(q);
                        }}
                        className="block w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-left text-sm font-semibold text-[#334155] transition hover:border-[#7C3AED]/30 hover:text-[#7C3AED]"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Intelligence sources</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Modules Ask VYRON can currently read from this workspace.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {sourceStatuses.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          </section>

          {sessionHistory.length > 0 ? (
            <section className={M.moduleDataSection}>
              <h2 className="text-xl font-bold text-[#0F172A]">Recent intelligence answers</h2>
              <p className="mt-1 text-sm font-medium text-[#64748B]">Session history — current browser session only.</p>
              <div className="mt-4 space-y-3">
                {sessionHistory.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setQuestion(entry.question);
                      setCurrentAnswer(entry.answer);
                    }}
                    className="block w-full rounded-2xl border border-[#E2E8F0] bg-white p-4 text-left transition hover:border-[#7C3AED]/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-[#0F172A]">{entry.question}</p>
                      <span className="text-xs font-medium text-[#94A3B8]">
                        {new Date(entry.askedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-medium text-[#64748B]">{entry.answer.answer}</p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[#64748B]">Limitations & safety</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-[#475569]">
              Ask VYRON currently answers from available workspace intelligence only. It does not invent values and does
              not execute actions without approval. This is the VYRON Intelligence Assistant — deterministic analysis
              from real operational engines, not generative AI.
            </p>
          </section>

          {!intelligenceReady && !loading ? (
            <section className={M.moduleDataSection}>
              <h2 className="text-xl font-bold text-[#0F172A]">
                VYRON needs more operational data to answer this properly.
              </h2>
              <p className="mt-2 text-sm font-medium text-[#64748B]">
                Load operational records so intelligence engines can produce evidence-backed answers.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href="/products" className={`${M.primaryBtn} px-4 py-2 text-sm`}>
                  Create Products
                </Link>
                <Link href="/recipes" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
                  Create BOMs
                </Link>
                <Link href="/suppliers" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
                  Import Suppliers
                </Link>
                <Link href="/customer-invoices" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
                  Process Invoices
                </Link>
                <Link href="/integrations/xero" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
                  Connect Xero
                </Link>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function SourceCard({ source }: { source: IntelligenceSourceStatus }) {
  const iconMap: Record<string, typeof BarChart3> = {
    "business-health": BarChart3,
    "early-warning": Shield,
    "predictive-risk": LineChart,
    "root-cause": Search,
    decisions: Gavel,
    actions: CheckSquare,
    xero: Wallet,
    "cost-intelligence": TrendingDown,
  };
  const Icon = iconMap[source.id] || Brain;

  return (
    <Link
      href={source.href}
      className={`${M.moduleDataSection} block p-4 transition hover:border-[#7C3AED]/30 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F6F7FB] p-2">
            <Icon size={18} className="text-[#7C3AED]" />
          </div>
          <div>
            <h3 className="font-bold text-[#0F172A]">{source.label}</h3>
            <p className="mt-1 text-sm font-medium text-[#64748B]">{source.status}</p>
            <p className="mt-1 text-xs font-semibold text-[#94A3B8]">
              {source.available ? `${source.signalCount} signal(s)` : "Not available yet"}
            </p>
          </div>
        </div>
        <ArrowRight size={16} className="shrink-0 text-[#94A3B8]" />
      </div>
    </Link>
  );
}

function ConfidenceBadge({ confidence }: { confidence: DecisionConfidence }) {
  const classes = {
    High: "border-emerald-200 bg-emerald-50 text-emerald-800",
    Medium: "border-amber-200 bg-amber-50 text-amber-900",
    Low: "border-[#E2E8F0] bg-[#F6F7FB] text-[#64748B]",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${classes[confidence]}`}>
      {confidence} confidence
    </span>
  );
}
