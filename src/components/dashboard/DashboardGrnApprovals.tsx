"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PackageCheck } from "lucide-react";

type GrnException = { code: string; blocking: boolean; message: string };
type PendingGrn = {
  id: string;
  grnNumber: string;
  supplier: string | null;
  poNumber: string | null;
  purchaseOrderId: string | null;
  receivedAt: string | null;
  lineCount: number;
  totalQty: number;
  totalValue: number | null;
  submittedBy: string | null;
  submittedAt: string | null;
  status: string;
  pendingApprover: string;
  exceptions: GrnException[];
  canApproveSelf: boolean;
};
type Result = { id: string; grnNumber: string | null; ok: boolean; error?: string; status?: string };
type Payload = {
  setting: { installed: boolean; approvalRequired: boolean; updatedBy: string | null; updatedAt: string | null };
  pending: PendingGrn[];
  canApprove: boolean;
  canConfigure: boolean;
};

type Fetched = { hidden?: boolean; error?: string; data?: Payload };

/** Reads the pending list; sets no state (the caller applies the result). */
async function fetchApprovals(): Promise<Fetched> {
  try {
    const res = await fetch("/api/goods-receipts/approvals", { cache: "no-store" });
    if (res.status === 401 || res.status === 403) return { hidden: true };
    const json = await res.json();
    if (!json.ok) return { error: json.error || "Could not load GRN approvals." };
    return { data: json as Payload };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load GRN approvals." };
  }
}

const money = (n: number | null) =>
  n === null ? "Not priced" : `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "—");

/**
 * Dashboard — GRN Approvals. Lists every GRN awaiting approval and lets an
 * authorised approver approve several in one controlled action. Each GRN is
 * approved, posted and audited individually on the server; the result screen
 * lists successes and failures separately with the reason for each failure.
 */
export default function DashboardGrnApprovals() {
  const [data, setData] = useState<Payload | null>(null);
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [stage, setStage] = useState<"list" | "review">("list");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ succeeded: Result[]; failed: Result[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [single, setSingle] = useState<{ grn: PendingGrn; mode: "approve" | "reject" } | null>(null);
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");

  const apply = useCallback((r: Fetched) => {
    if (r.hidden) setHidden(true);
    else if (r.error) setError(r.error);
    else if (r.data) {
      const json = r.data;
      setData(json);
      setSelected((prev) => new Set([...prev].filter((id) => json.pending.some((g) => g.id === id))));
    }
  }, []);
  const load = useCallback(() => fetchApprovals().then(apply), [apply]);

  useEffect(() => {
    fetchApprovals().then(apply);
  }, [apply]);

  const eligible = useMemo(
    () => (data?.pending ?? []).filter((g) => g.status === "Pending Approval" && !g.canApproveSelf && g.exceptions.length === 0),
    [data]
  );
  const selectedGrns = (data?.pending ?? []).filter((g) => selected.has(g.id));

  if (hidden) return null;

  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/goods-receipts/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status}).`);
      setResults({ succeeded: json.succeeded || [], failed: json.failed || [] });
      setSelected(new Set());
      setStage("list");
      setSingle(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSetting(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/goods-receipts/approvals/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalRequired: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not change the setting.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the setting.");
    } finally {
      setBusy(false);
    }
  }

  const pending = data?.pending ?? [];
  const setting = data?.setting;

  return (
    <section className="rounded-2xl border border-[#E8EDF2] bg-white p-6" aria-labelledby="grn-approvals-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <PackageCheck size={20} aria-hidden />
          </span>
          <div>
            <h2 id="grn-approvals-heading" className="text-[1.05rem] font-black text-[#0B202B]">
              GRN Approvals
            </h2>
            <p className="text-xs font-semibold text-[#64748B]">
              {setting?.approvalRequired
                ? "Goods received notes wait here; stock is posted only when an authorised approver approves them."
                : setting?.installed === false
                  ? "GRN approval is not installed in this database yet."
                  : "GRN approval is off — goods received notes post stock as soon as they are saved."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-2xl px-4 py-2 text-center ${pending.length ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}
            aria-label={`${pending.length} pending GRN approvals`}
          >
            <span className="block text-2xl font-black leading-none">{data ? pending.length : "…"}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.12em]">Pending</span>
          </span>
          {data?.canConfigure && setting?.installed ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleSetting(!setting.approvalRequired)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50"
            >
              {setting.approvalRequired ? "Switch approval off" : "Require GRN approval"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p> : null}

      {results ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-800">
              Succeeded ({results.succeeded.length})
            </div>
            <ul className="mt-1 space-y-0.5 text-sm font-semibold text-emerald-900">
              {results.succeeded.map((r) => (
                <li key={r.id}>
                  {r.grnNumber ?? r.id} — {r.status === "Rejected" ? "rejected" : "approved and posted to stock"}
                </li>
              ))}
              {results.succeeded.length === 0 ? <li>None.</li> : null}
            </ul>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-rose-800">Failed ({results.failed.length})</div>
            <ul className="mt-1 space-y-1 text-sm font-semibold text-rose-900">
              {results.failed.map((r) => (
                <li key={r.id}>
                  <b>{r.grnNumber ?? r.id}</b>: {r.error}
                </li>
              ))}
              {results.failed.length === 0 ? <li>None.</li> : null}
            </ul>
          </div>
          <button type="button" onClick={() => setResults(null)} className="text-left text-xs font-black text-slate-500 underline">
            Dismiss results
          </button>
        </div>
      ) : null}

      {pending.length ? (
        stage === "list" ? (
          <>
            {data?.canApprove ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(eligible.map((g) => g.id)))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-black text-slate-700"
                >
                  Select all eligible ({eligible.length})
                </button>
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-black text-slate-800">{selected.size} selected</span>
                {selected.size ? (
                  <>
                    <button type="button" onClick={() => setStage("review")} className="rounded-lg bg-indigo-700 px-3 py-1.5 font-black text-white">
                      Review selected ({selected.size})
                    </button>
                    <button type="button" onClick={() => setSelected(new Set())} className="rounded-lg border border-slate-200 px-3 py-1.5 font-black text-slate-700">
                      Clear
                    </button>
                  </>
                ) : null}
                <span className="font-semibold text-slate-500">
                  GRNs you submitted, or with exceptions, cannot be bulk approved — open them individually.
                </span>
              </div>
            ) : (
              <p className="mt-4 text-xs font-semibold text-slate-500">You can view pending GRNs; approving them needs the Approve GRNs permission.</p>
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="py-2 pr-2" />
                    <th className="py-2 pr-3">GRN</th>
                    <th className="py-2 pr-3">Supplier</th>
                    <th className="py-2 pr-3">PO</th>
                    <th className="py-2 pr-3">Received</th>
                    <th className="py-2 pr-3 text-right">Lines</th>
                    <th className="py-2 pr-3 text-right">Qty / Value</th>
                    <th className="py-2 pr-3">Submitted</th>
                    <th className="py-2 pr-3">Status / Approver</th>
                    <th className="py-2 pr-3">Exceptions</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {pending.map((g) => {
                    const isEligible = eligible.some((e) => e.id === g.id);
                    return (
                      <tr key={g.id} className="border-t border-slate-100 align-top">
                        <td className="py-2 pr-2">
                          {data?.canApprove ? (
                            <input
                              type="checkbox"
                              disabled={!isEligible}
                              checked={selected.has(g.id)}
                              onChange={(e) =>
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(g.id);
                                  else next.delete(g.id);
                                  return next;
                                })
                              }
                              aria-label={`Select ${g.grnNumber}`}
                              title={
                                g.canApproveSelf
                                  ? "You submitted this GRN — another approver must approve it"
                                  : g.exceptions.length
                                    ? "Has exceptions — approve individually after review"
                                    : g.status !== "Pending Approval"
                                      ? "Being processed"
                                      : "Select for approval"
                              }
                            />
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 font-black">
                          <Link href={`/goods-receipts/${g.id}`} className="text-blue-700 hover:underline">
                            {g.grnNumber}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 font-semibold text-slate-800">{g.supplier ?? "—"}</td>
                        <td className="py-2 pr-3">
                          {g.purchaseOrderId ? (
                            <Link href={`/purchase-orders/${g.purchaseOrderId}`} className="font-semibold text-blue-700 hover:underline">
                              {g.poNumber ?? "PO"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{when(g.receivedAt)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{g.lineCount}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {g.totalQty.toLocaleString("en-ZA")}
                          <span className="block text-[11px] text-slate-500">{money(g.totalValue)}</span>
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {g.submittedBy ?? "—"}
                          <span className="block text-[11px] text-slate-500">{when(g.submittedAt)}</span>
                        </td>
                        <td className="py-2 pr-3 text-[12px]">
                          <span className="font-black text-amber-800">{g.status}</span>
                          <span className="block text-slate-500">{g.pendingApprover}</span>
                        </td>
                        <td className="py-2 pr-3 text-[12px]">
                          {g.exceptions.length ? (
                            <ul className="space-y-0.5">
                              {g.exceptions.map((e) => (
                                <li key={e.message} className={e.blocking ? "font-bold text-rose-700" : "font-semibold text-amber-800"}>
                                  {e.blocking ? "Blocks approval: " : "Review: "}
                                  {e.message}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="font-semibold text-emerald-700">None</span>
                          )}
                        </td>
                        <td className="py-2 whitespace-nowrap">
                          {data?.canApprove && g.status === "Pending Approval" && !g.canApproveSelf ? (
                            <span className="flex gap-1">
                              {!g.exceptions.some((e) => e.blocking) ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSingle({ grn: g, mode: "approve" });
                                    setAck(false);
                                  }}
                                  className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-black text-white"
                                >
                                  Approve
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  setSingle({ grn: g, mode: "reject" });
                                  setReason("");
                                }}
                                className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-black text-rose-700"
                              >
                                Reject
                              </button>
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <h3 className="text-sm font-black text-indigo-900">Review {selectedGrns.length} GRN(s) before approval</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-800">
              {selectedGrns.map((g) => (
                <li key={g.id} className="font-semibold">
                  {g.grnNumber} · {g.supplier ?? "—"} · PO {g.poNumber ?? "—"} · {g.lineCount} line(s) · qty {g.totalQty.toLocaleString("en-ZA")} ·{" "}
                  {money(g.totalValue)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] font-semibold text-slate-600">
              Each GRN is checked again, approved and posted to stock individually, and audited with your name and the time. If one fails, the
              others are unaffected and the failure is listed with its reason.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit({ action: "approve", ids: selectedGrns.map((g) => g.id) })}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
              >
                {busy ? "Approving…" : `Confirm approval of ${selectedGrns.length} GRN(s)`}
              </button>
              <button type="button" disabled={busy} onClick={() => setStage("list")} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                Back
              </button>
            </div>
          </div>
        )
      ) : data ? (
        <p className="mt-4 text-sm font-semibold text-slate-500">No goods received notes are awaiting approval.</p>
      ) : null}

      {single ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-black text-slate-900">
              {single.mode === "approve" ? "Approve" : "Reject"} {single.grn.grnNumber}
            </h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {single.grn.supplier ?? "—"} · PO {single.grn.poNumber ?? "—"} · {single.grn.lineCount} line(s) · {money(single.grn.totalValue)}
            </p>
            {single.mode === "approve" ? (
              <>
                {single.grn.exceptions.length ? (
                  <div className="mt-3 rounded-lg bg-amber-50 p-3 text-[12px] font-semibold text-amber-900">
                    <ul className="list-disc pl-4">
                      {single.grn.exceptions.map((e) => (
                        <li key={e.message}>{e.message}</li>
                      ))}
                    </ul>
                    <label className="mt-2 flex items-center gap-2 font-black">
                      <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I have reviewed these exceptions and approve the GRN.
                    </label>
                  </div>
                ) : null}
                <p className="mt-3 text-[12px] font-semibold text-slate-600">Approving posts the received quantities to stock and updates the purchase order. It is recorded against your name.</p>
              </>
            ) : (
              <label className="mt-3 block text-[11px] font-black uppercase text-slate-500">
                Reason (required)
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-semibold" />
              </label>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setSingle(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || (single.mode === "approve" ? single.grn.exceptions.length > 0 && !ack : reason.trim().length < 5)}
                onClick={() =>
                  void submit(
                    single.mode === "approve"
                      ? { action: "approve", ids: [single.grn.id], acknowledgeExceptions: ack }
                      : { action: "reject", id: single.grn.id, reason }
                  )
                }
                className={`rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-40 ${single.mode === "approve" ? "bg-emerald-700" : "bg-rose-700"}`}
              >
                {busy ? "Working…" : single.mode === "approve" ? "Approve and post" : "Reject GRN"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
