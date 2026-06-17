"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import {
  addProcurementEvidence,
  getProcurementAuditTrail,
  getProcurementEvidence,
  getProcurementTrackingByKey,
  procurementMoney,
  saveProcurementTracking,
  type ProcurementAuditRow,
  type ProcurementEvidenceRow,
  type ProcurementRecommendation,
} from "@/lib/vyron-procurement-ai-data";

export default function ProcurementRecommendationDetailClient({
  recommendation,
}: {
  recommendation: ProcurementRecommendation;
}) {
  const key = recommendation.recommendation_key;
  const [status, setStatus] = useState(recommendation.status || "New");
  const [ownerName, setOwnerName] = useState(recommendation.owner_name || "");
  const [ownerEmail, setOwnerEmail] = useState(recommendation.owner_email || "");
  const [notes, setNotes] = useState(recommendation.notes || "");
  const [dueDate, setDueDate] = useState(recommendation.due_date || "");
  const [scheduledReviewDate, setScheduledReviewDate] = useState(recommendation.scheduled_review_date || "");
  const [expectedBenefit, setExpectedBenefit] = useState(
    Number(recommendation.expected_benefit || recommendation.potential_benefit_annual || 0)
  );
  const [actualBenefit, setActualBenefit] = useState(Number(recommendation.actual_benefit || 0));
  const [implementationDate, setImplementationDate] = useState(recommendation.implementation_date || "");
  const [evidence, setEvidence] = useState(recommendation.evidence || "");
  const [evidenceRows, setEvidenceRows] = useState<ProcurementEvidenceRow[]>([]);
  const [auditRows, setAuditRows] = useState<ProcurementAuditRow[]>([]);
  const [newEvidenceType, setNewEvidenceType] = useState("Notes");
  const [newEvidenceTitle, setNewEvidenceTitle] = useState("");
  const [newEvidenceContent, setNewEvidenceContent] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [tracking, ev, audit] = await Promise.all([
        getProcurementTrackingByKey(key),
        getProcurementEvidence(key),
        getProcurementAuditTrail(key),
      ]);
      if (cancelled) return;
      if (tracking) {
        setStatus(tracking.status);
        setOwnerName(tracking.ownerName);
        setOwnerEmail(tracking.ownerEmail);
        setNotes(tracking.notes);
        setDueDate(tracking.dueDate);
        setScheduledReviewDate(tracking.scheduledReviewDate);
        setExpectedBenefit(tracking.expectedBenefit);
        setActualBenefit(tracking.actualBenefit);
        setImplementationDate(tracking.implementationDate);
        setEvidence(tracking.evidence);
      }
      setEvidenceRows(ev);
      setAuditRows(audit);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [key]);

  async function persist(nextStatus: string) {
    setStatus(nextStatus);
    setMessage("");
    setErrorMessage("");
    try {
      await saveProcurementTracking(key, {
        status: nextStatus as any,
        ownerName,
        ownerEmail,
        notes,
        dueDate,
        scheduledReviewDate,
        expectedBenefit,
        actualBenefit,
        implementationDate,
        evidence,
      });
      const [ev, audit] = await Promise.all([getProcurementEvidence(key), getProcurementAuditTrail(key)]);
      setEvidenceRows(ev);
      setAuditRows(audit);
      setMessage(`Workflow updated: ${nextStatus}.`);
    } catch (error: any) {
      setErrorMessage(error?.message || "Could not save workflow.");
    }
  }

  async function addEvidenceItem() {
    if (!newEvidenceTitle.trim()) {
      setErrorMessage("Evidence title is required.");
      return;
    }
    await addProcurementEvidence(key, {
      evidenceType: newEvidenceType,
      title: newEvidenceTitle.trim(),
      content: newEvidenceContent.trim() || undefined,
      createdBy: ownerName || "Procurement Manager",
    });
    setNewEvidenceTitle("");
    setNewEvidenceContent("");
    setEvidenceRows(await getProcurementEvidence(key));
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "procurement",
        title: "Procurement Recommendation Detail",
        subtitle: "Premium VYRON COST workflow for procurement recommendation detail.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <Link href="/ai-procurement-manager" className="text-sm font-black text-violet-700">
              ← Back to AI Procurement Manager
            </Link>

            <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-800">
                    {recommendation.category}
                  </span>
                  <h1 className="mt-3 text-2xl font-black text-slate-900">{recommendation.title}</h1>
                  <p className="mt-2 text-sm font-bold text-slate-600">{recommendation.summary}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Potential benefit</div>
                  <div className="text-3xl font-black text-[#65A30D]">
                    {procurementMoney(recommendation.potential_benefit_annual)}/yr
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-500">
                    {recommendation.confidence_level} · {Number(recommendation.confidence_score).toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
                <h2 className="text-lg font-black text-slate-900">Explanation engine</h2>
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Problem</dt>
                    <dd className="mt-1 font-bold text-slate-800">{recommendation.problem_statement || recommendation.summary}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Cause</dt>
                    <dd className="mt-1 font-bold text-slate-800">{recommendation.cause_statement || recommendation.why_exists}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Formula used</dt>
                    <dd className="mt-1 font-mono text-xs font-bold text-violet-900">{recommendation.formula_expression}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Potential benefit</dt>
                    <dd className="mt-1 font-bold text-[#65A30D]">{procurementMoney(recommendation.potential_benefit_annual)}/yr</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Confidence</dt>
                    <dd className="mt-1 font-bold text-slate-800">
                      {recommendation.confidence_level} · {Number(recommendation.confidence_score).toFixed(0)}%
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Expected result</dt>
                    <dd className="mt-1 font-bold text-slate-800">{recommendation.expected_result}</dd>
                  </div>
                  {recommendation.selling_price_adjustment != null && (
                    <div>
                      <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Selling price adjustment</dt>
                      <dd className="mt-1 font-bold text-slate-800">R{Number(recommendation.selling_price_adjustment).toFixed(2)}</dd>
                    </div>
                  )}
                  {recommendation.expected_gp_improvement_pct != null && (
                    <div>
                      <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Expected GP improvement</dt>
                      <dd className="mt-1 font-bold text-slate-800">
                        {Number(recommendation.expected_gp_improvement_pct).toFixed(1)}%
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="rounded-[2rem] bg-slate-50 p-6">
                <h2 className="text-lg font-black text-slate-900">Data used</h2>
                <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-white p-4 text-xs font-mono text-slate-700">
                  {JSON.stringify(recommendation.data_used, null, 2)}
                </pre>
                {recommendation.missing_inputs.length > 0 && (
                  <div className="mt-4 rounded-xl bg-amber-50 p-4 text-xs font-bold text-amber-900">
                    Assumptions / missing inputs: {recommendation.missing_inputs.join("; ")}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
                <h3 className="font-black text-slate-900">Affected products</h3>
                <ul className="mt-3 space-y-2 text-sm font-bold text-slate-700">
                  {recommendation.affected_products.length ? (
                    recommendation.affected_products.map((p) => (
                      <li key={p.productId} className="rounded-xl bg-slate-50 px-3 py-2">
                        {p.productName}
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-500">None linked (supplier-level action)</li>
                  )}
                </ul>
              </div>
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
                <h3 className="font-black text-slate-900">Affected suppliers</h3>
                <ul className="mt-3 space-y-2 text-sm font-bold text-slate-700">
                  {recommendation.affected_suppliers.length ? (
                    recommendation.affected_suppliers.map((s, i) => (
                      <li key={`${s.supplierName}-${i}`} className="rounded-xl bg-slate-50 px-3 py-2">
                        {s.supplierName}
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-500">None specified</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="rounded-[2rem] bg-[#A3E635]/10 p-6">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#65A30D]">Recommended action</div>
              <p className="mt-2 text-sm font-bold text-[#4D7C0F]">{recommendation.recommended_action}</p>
            </div>

            <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <h2 className="text-lg font-black text-slate-900">Workflow & impact</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">New → Assigned → Under Review → Accepted / Rejected → Implemented → Closed</p>

              <div className="mt-4 flex flex-wrap gap-2">
                {(["Assigned", "Under Review", "Accepted", "Rejected", "Implemented", "Closed"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => persist(s)}
                    className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.1em] ${
                      status === s ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                  Owner
                  <input
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  />
                </label>
                <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                  Owner email
                  <input
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  />
                </label>
                <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                  Due date
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  />
                </label>
                <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                  Scheduled review
                  <input
                    type="date"
                    value={scheduledReviewDate}
                    onChange={(e) => setScheduledReviewDate(e.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  />
                </label>
                <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                  Expected benefit (annual)
                  <input
                    type="number"
                    value={expectedBenefit}
                    onChange={(e) => setExpectedBenefit(Number(e.target.value))}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  />
                </label>
                <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                  Actual benefit (annual)
                  <input
                    type="number"
                    value={actualBenefit}
                    onChange={(e) => setActualBenefit(Number(e.target.value))}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  />
                </label>
                <div className="md:col-span-2 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
                  <div>Potential benefit: {procurementMoney(recommendation.potential_benefit_annual)}</div>
                  <div className="mt-1">Expected vs potential gap: {procurementMoney(recommendation.potential_benefit_annual - expectedBenefit)}</div>
                  <div className="mt-1">Realized vs expected: {procurementMoney(actualBenefit - expectedBenefit)}</div>
                </div>
                <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                  Implementation date
                  <input
                    type="date"
                    value={implementationDate}
                    onChange={(e) => setImplementationDate(e.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  />
                </label>
              </div>

              <label className="mt-4 grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                Evidence / notes
                <textarea
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  rows={3}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                />
              </label>

              <button
                type="button"
                onClick={() => persist(status)}
                className="mt-4 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white"
              >
                Save tracking
              </button>

              {message && <p className="mt-3 text-sm font-bold text-[#65A30D]">{message}</p>}
              {errorMessage && <p className="mt-3 text-sm font-bold text-red-600">{errorMessage}</p>}
            </div>

            <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <h3 className="font-black text-slate-900">Evidence log</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <select
                  value={newEvidenceType}
                  onChange={(e) => setNewEvidenceType(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                >
                  {["Notes", "Contract", "Email", "Invoice", "Benchmark"].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  value={newEvidenceTitle}
                  onChange={(e) => setNewEvidenceTitle(e.target.value)}
                  placeholder="Evidence title"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold md:col-span-2"
                />
              </div>
              <textarea
                value={newEvidenceContent}
                onChange={(e) => setNewEvidenceContent(e.target.value)}
                placeholder="Details"
                rows={2}
                className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
              />
              <button
                type="button"
                onClick={addEvidenceItem}
                className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"
              >
                Add evidence
              </button>
              <ul className="mt-4 space-y-2">
                {evidenceRows.map((row) => (
                  <li key={row.id} className="rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700">
                    <span className="text-[10px] font-black uppercase text-slate-400">{row.evidence_type}</span>
                    <div>{row.title}</div>
                    {row.content && <p className="mt-1 text-xs text-slate-500">{row.content}</p>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <h3 className="font-black text-slate-900">Audit history</h3>
              <ul className="mt-3 space-y-2 text-xs font-bold text-slate-600">
                {auditRows.length ? (
                  auditRows.map((row) => (
                    <li key={row.id} className="rounded-xl bg-slate-50 px-3 py-2">
                      {new Date(row.changed_at).toLocaleString()} · {row.field_name}: {row.old_value || "—"} →{" "}
                      {row.new_value || "—"} ({row.changed_by || "System"})
                    </li>
                  ))
                ) : (
                  <li>No workflow changes recorded yet.</li>
                )}
              </ul>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
