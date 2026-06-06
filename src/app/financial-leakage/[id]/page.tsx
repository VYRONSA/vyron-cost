import Link from "next/link";
import StatusPill from "@/components/StatusPill";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getRecoveryDrilldown } from "@/lib/vyron-recovery-drilldown-data";
import { formatMoney } from "@/lib/vyron-cost-data";
import { ArrowLeft, ShieldAlert, Sparkles, Wallet } from "lucide-react";

function severityTone(severity: string | null): "red" | "amber" | "emerald" | "slate" {
  const value = String(severity || "").toLowerCase();
  if (value.includes("critical")) return "red";
  if (value.includes("high")) return "amber";
  if (value.includes("low")) return "slate";
  return "slate";
}

export default async function FinancialLeakageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getRecoveryDrilldown(id);

  if (!detail) {
    return (
      <VyronCostAiShell title="Recovery Detail Not Found" subtitle="RECOVERY INTELLIGENCE · DRILLDOWN">
        <div className="rounded-[2rem] border border-violet-100 bg-white p-8 font-bold text-slate-600 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
          Recovery detail not found.
          <Link
            href="/financial-leakage"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white"
          >
            <ArrowLeft size={16} />
            Back to Recovery Intelligence
          </Link>
        </div>
      </VyronCostAiShell>
    );
  }

  const title = detail.isDuplicate
    ? "Duplicate Invoice Risk"
    : detail.finding.title || "Recovery Detail";

  const subtitle = detail.isDuplicate
    ? "DUPLICATE INVOICE EXPOSURE · ONCE-OFF RECOVERY REVIEW"
    : "CLIENT-EXPLAINABLE FORMULA · RECOVERY INTELLIGENCE";

  return (
    <VyronCostAiShell title={title} subtitle={subtitle}>
      <section className="relative overflow-hidden rounded-[2.4rem] border border-violet-100 bg-white p-7 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-100 to-fuchsia-100 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-violet-700">
          <Sparkles size={15} />
          {detail.isDuplicate ? "Once-off duplicate risk" : "Recovery drilldown"}
        </div>
        <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-600">
          {detail.isDuplicate
            ? detail.currentState
            : detail.finding.description || detail.cause}
        </p>
      </section>

      {detail.isDuplicate ? (
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Duplicate Exposure</div>
            <div className="mt-3 text-4xl font-black text-red-600">{formatMoney(detail.duplicateExposure || 0)}</div>
          </div>
          <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Duplicate Amount</div>
            <div className="mt-3 text-4xl font-black text-slate-950">{formatMoney(detail.duplicateAmount || 0)}</div>
          </div>
          <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Potential Recoverable</div>
            <div className="mt-3 text-4xl font-black text-violet-700">{formatMoney(detail.potentialRecovery)}</div>
          </div>
          <div className="rounded-[2rem] border border-violet-100 bg-gradient-to-br from-violet-700 to-fuchsia-700 p-6 text-white shadow-[0_18px_45px_rgba(124,58,237,0.28)]">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-100">Duplicate Count</div>
            <div className="mt-3 text-4xl font-black">{detail.duplicateCount || 1}</div>
            <div className="mt-2 flex items-center gap-2 text-sm font-bold text-violet-100">
              <Wallet size={16} />
              {detail.invoiceNumber}
            </div>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Monthly Leakage</div>
            <div className="mt-3 text-4xl font-black text-red-600">{formatMoney(detail.monthlyLoss)}</div>
          </div>
          <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Potential Recovery</div>
            <div className="mt-3 text-4xl font-black text-violet-700">{formatMoney(detail.potentialRecovery)}</div>
          </div>
          {detail.annualRecovery != null ? (
            <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Annual Recovery</div>
              <div className="mt-3 text-4xl font-black text-fuchsia-700">{formatMoney(detail.annualRecovery)}</div>
            </div>
          ) : (
            <div className="rounded-[2rem] border border-violet-100 bg-slate-50 p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Recovery Basis</div>
              <div className="mt-3 text-lg font-black text-slate-700">Current exposure (not annualised)</div>
            </div>
          )}
          <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Severity</div>
            <div className="mt-4">
              <StatusPill tone={severityTone(detail.finding.severity)}>{detail.finding.severity || "Medium"}</StatusPill>
            </div>
          </div>
        </section>
      )}

      <section className="grid min-w-0 gap-6 lg:grid-cols-1 xl:grid-cols-[1fr_0.85fr] xl:items-start">
        <div className="min-w-0 overflow-hidden rounded-[2.4rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Formula & inputs</div>
          <h2 className="mt-1 text-2xl font-black text-slate-950">How this recovery is calculated</h2>

          <div className="mt-5 rounded-3xl bg-gradient-to-br from-violet-800 to-fuchsia-800 p-6 text-white shadow-lg shadow-violet-500/20">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-200">Formula</div>
            <div className="mt-2 text-xl font-black">{detail.formula}</div>
          </div>

          <div className="mt-5 grid gap-3">
            {detail.explanationRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-4 rounded-2xl bg-slate-50 px-5 py-4 text-sm">
                <span className="font-bold text-slate-500">{row.label}</span>
                <span className="text-right font-black text-slate-950">{row.value}</span>
              </div>
            ))}
          </div>

          {detail.isDuplicate && detail.matchingInvoices && detail.matchingInvoices.length > 0 ? (
            <div className="mt-8">
              <h3 className="text-lg font-black text-slate-950">Matching invoice documents</h3>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-violet-100">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-5 bg-violet-800 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-violet-100">
                    <div>Supplier</div>
                    <div>Invoice #</div>
                    <div>Amount</div>
                    <div>Matches</div>
                    <div>Status</div>
                  </div>
                  {detail.matchingInvoices.map((row) => (
                    <div
                      key={`${row.invoice_number}-${row.duplicate_of || ""}`}
                      className="grid grid-cols-5 items-center border-t border-slate-100 px-4 py-4 text-sm"
                    >
                      <div className="font-bold text-slate-700">{row.supplier_name}</div>
                      <div className="font-black text-violet-700">{row.invoice_number}</div>
                      <div className="font-black text-slate-950">{formatMoney(row.invoice_amount)}</div>
                      <div className="text-xs font-bold text-slate-500">{row.duplicate_of || "—"}</div>
                      <div>{row.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-w-0 rounded-[2.4rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="text-violet-600" size={22} />
            <h2 className="text-2xl font-black text-slate-950">Client explanation</h2>
          </div>
          <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">{detail.currentState}</p>
          <p className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm font-black leading-7 text-violet-900">
            {detail.recommendedState}
          </p>

          <h3 className="mt-6 text-lg font-black text-slate-950">Recommended actions</h3>
          <div className="mt-3 space-y-3">
            {detail.recommendedActions.map((action) => (
              <div key={action} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                {action}
              </div>
            ))}
          </div>

          <Link
            href="/financial-leakage"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/20"
          >
            <ArrowLeft size={16} />
            Back to Recovery Intelligence
          </Link>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
