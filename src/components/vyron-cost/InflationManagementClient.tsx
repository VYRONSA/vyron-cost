"use client";

import { useEffect, useState } from "react";
import { Card, Notice, Pill, PrimaryButton, SecondaryButton } from "@/components/vyron-order-engine/ui";
import { downloadCsv } from "@/lib/vyron-csv-download";

type Item = {
  key: string;
  entityType: string;
  name: string;
  supplierName: string;
  rowsBefore: number;
  rowsAfter: number;
  lastPriceBefore: number | null;
  lastDateBefore: string | null;
  basisPrice: number | null;
  basisDate: string | null;
  basisInvoice: string | null;
  latestPrice: number | null;
  latestDate: string | null;
  recordedPct: number | null;
  rebasedPct: number | null;
  status: "REBASED" | "UNCHANGED" | "SINGLE_PURCHASE" | "NO_RELIABLE_BASIS";
};
type Review = { baseline: string; items: Item[]; summary: { items: number; rowsExcluded: number; itemsChanged: number; itemsNeedingData: number; averageRecordedPct: number | null; averageRebasedPct: number | null } };
type Event = { id: string; event_type: string; actor: string; old_value: string | null; new_value: string | null; detail: string | null; created_at: string };
type Loaded = { currentBaseline: string | null; agreedBaseline: string; review: Review; events: Event[]; canManage: boolean };

const STATUS: Record<Item["status"], { label: string; tone: "green" | "slate" | "amber" | "rose" | "blue" }> = {
  REBASED: { label: "Re-based", tone: "blue" },
  UNCHANGED: { label: "Unchanged", tone: "slate" },
  SINGLE_PURCHASE: { label: "One purchase since baseline", tone: "amber" },
  NO_RELIABLE_BASIS: { label: "Needs corrected cost data", tone: "rose" },
};
const price = (v: number | null) => (v === null ? "—" : `R${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`);
const pct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);

async function load(baseline: string): Promise<{ ok: true; data: Loaded } | { ok: false; error: string }> {
  const res = await fetch(`/api/inflation/baseline${baseline ? `?baseline=${baseline}` : ""}`, { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => ({ ok: false, error: "Inflation review could not be loaded." }));
  return res.ok ? { ok: true, data: res } : { ok: false, error: res.error || "Inflation review could not be loaded." };
}

export default function InflationManagementClient() {
  const [proposed, setProposed] = useState("");
  const [data, setData] = useState<Loaded | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"ALL" | Item["status"]>("ALL");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void load(proposed).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setData(r.data);
        if (!proposed) setProposed(r.data.review.baseline);
      } else setMessage({ tone: "error", text: r.error });
    });
    return () => {
      cancelled = true;
    };
  }, [proposed, version]);

  const commit = async (action: "set" | "remove") => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/inflation/baseline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, baseline: proposed, reason }) });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "Change failed.");
      setMessage({ tone: "success", text: action === "set" ? `Inflation baseline set to ${out.baseline}. Earlier price rows are excluded from inflation; nothing was deleted.` : "Inflation baseline removed; inflation uses the full history again." });
      setReason("");
      setVersion((v) => v + 1);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Change failed." });
    } finally {
      setBusy(false);
    }
  };

  const needsData = (data?.review.items || []).filter((i) => i.status === "NO_RELIABLE_BASIS");
  const exportRequirement = () =>
    downloadCsv(
      `inflation-corrected-cost-data-required-${data?.review.baseline}.csv`,
      ["Item type", "Item", "Supplier", "Last price before baseline (unreliable)", "Date", "Corrected cost price (to supply)", "Effective date (to supply)", "Source document (to supply)"],
      needsData.map((i) => [i.entityType, i.name, i.supplierName, i.lastPriceBefore ?? "", i.lastDateBefore ?? "", "", "", ""])
    );

  const shown = (data?.review.items || []).filter((i) => filter === "ALL" || i.status === filter);
  const s = data?.review.summary;
  const committed = data?.currentBaseline ?? null;

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Historical Inflation Management</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
          Cost prices captured before the agreed starting point were incorrect, so inflation measured against them is wrong. Setting the inflation baseline excludes earlier price
          history from inflation and re-bases each item on its first purchase on or after the baseline. Invoice costs and price history are never changed or deleted, and no
          corrected cost is invented: items with no purchase since the baseline are listed as needing corrected source data.
        </p>
      </div>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Card title="Baseline">
        <div className="flex flex-wrap items-end gap-4">
          <div className="text-sm font-semibold text-slate-700">
            Committed baseline: <b data-testid="inflation-committed">{committed || "none (full history in use)"}</b>
            <span className="block text-xs text-slate-500">Agreed starting point: {data?.agreedBaseline || "2026-10-01"}</span>
          </div>
          <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
            Preview baseline
            <input type="date" value={proposed} onChange={(e) => e.target.value && setProposed(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
          </label>
        </div>
        {s ? (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="inflation-impact">
            <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-500">Price rows excluded</div><div className="text-xl font-black">{s.rowsExcluded}</div></div>
            <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-500">Items whose inflation changes</div><div className="text-xl font-black">{s.itemsChanged} / {s.items}</div></div>
            <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-500">Average inflation, recorded</div><div className="text-xl font-black">{pct(s.averageRecordedPct)}</div></div>
            <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase text-slate-500">Average inflation, re-based</div><div className="text-xl font-black">{pct(s.averageRebasedPct)}</div></div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3"><div className="text-[10px] font-black uppercase text-rose-700">Need corrected cost data</div><div className="text-xl font-black text-rose-800">{s.itemsNeedingData}</div></div>
          </div>
        ) : null}
        {data?.canManage ? (
          <div className="mt-4 grid gap-2">
            <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
              Reason (required to commit)
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[60px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold normal-case" placeholder="e.g. Agreed with client 10 Nov: cost prices before October 2026 were captured incorrectly" />
            </label>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton disabled={busy || reason.trim().length < 10 || !proposed || proposed === committed} onClick={() => void commit("set")}>
                Commit baseline {proposed}
              </PrimaryButton>
              {committed ? <SecondaryButton tone="rose" disabled={busy || reason.trim().length < 10} onClick={() => void commit("remove")}>Remove baseline</SecondaryButton> : null}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs font-semibold text-slate-500">Committing a baseline needs the Company setup permission.</p>
        )}
      </Card>

      {needsData.length ? (
        <Card title="Data import / reconciliation requirement" actions={<SecondaryButton onClick={exportRequirement}>Download requirement (CSV)</SecondaryButton>}>
          <p className="text-sm font-semibold text-slate-600">
            {needsData.length} item(s) have no purchase on or after {data?.review.baseline}, so there is no reliable cost basis to measure inflation from. To include them, the client
            must supply a corrected cost price per item with its effective date and source document (supplier invoice or price list). Until then they are excluded from
            inflation — not estimated.
          </p>
        </Card>
      ) : null}

      <Card title={`Items (${shown.length})`}>
        <div className="mb-3 flex flex-wrap gap-2">
          {(["ALL", "REBASED", "UNCHANGED", "SINGLE_PURCHASE", "NO_RELIABLE_BASIS"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs font-black ${filter === k ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-700"}`}>
              {k === "ALL" ? "All" : STATUS[k].label}
            </button>
          ))}
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Supplier</th>
                <th className="py-2 pr-3 text-right">Before baseline (excluded)</th>
                <th className="py-2 pr-3 text-right">Basis (first since baseline)</th>
                <th className="py-2 pr-3 text-right">Latest</th>
                <th className="py-2 pr-3 text-right">Recorded</th>
                <th className="py-2 pr-3 text-right">Re-based</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.key} className="border-t border-slate-100 align-top font-semibold text-slate-700">
                  <td className="py-2 pr-3">{i.name}<span className="block text-xs text-slate-400">{i.entityType}</span></td>
                  <td className="py-2 pr-3">{i.supplierName}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{i.rowsBefore ? <>{price(i.lastPriceBefore)}<span className="block text-xs text-slate-400">{i.rowsBefore} row(s) to {i.lastDateBefore}</span></> : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{price(i.basisPrice)}<span className="block text-xs text-slate-400">{i.basisDate || ""} {i.basisInvoice || ""}</span></td>
                  <td className="py-2 pr-3 text-right tabular-nums">{price(i.latestPrice)}<span className="block text-xs text-slate-400">{i.latestDate}</span></td>
                  <td className="py-2 pr-3 text-right tabular-nums">{pct(i.recordedPct)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-black">{pct(i.rebasedPct)}</td>
                  <td className="py-2 pr-3"><Pill tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Pill></td>
                </tr>
              ))}
              {data && !shown.length ? <tr><td colSpan={8} className="py-6 text-center text-sm text-slate-400">No supplier price history.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Baseline history">
        {data?.events.length ? (
          <ul className="grid gap-2 text-sm font-semibold text-slate-700">
            {data.events.map((e) => (
              <li key={e.id}>{new Date(e.created_at).toLocaleString("en-ZA")} · {e.actor} · {e.detail}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-semibold text-slate-400">No baseline has been committed.</p>
        )}
      </Card>
    </div>
  );
}
