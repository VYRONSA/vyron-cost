"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";

type SourceType = "customer_sales_order" | "store_order";
type Card = { id: string; jobCardNumber: string; status: string; statusChangedBy: string | null; printCount: number };

const STATUSES = ["Awaiting Production", "In Production", "Completed", "On Hold"];

export function jobCardPdfUrl(type: SourceType, ids: string[]) {
  return `/api/job-cards/pdf?type=${type}&ids=${ids.map(encodeURIComponent).join(",")}`;
}

/** The order's job card, null when none issued yet, undefined when it could not be read. */
async function fetchCard(type: SourceType, orderId: string): Promise<Card | null | undefined> {
  try {
    const res = await fetch(`/api/job-cards?type=${type}&id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    return res.ok && json.ok ? ((json.card ?? null) as Card | null) : undefined;
  } catch {
    return undefined; // the button still works without the lookup
  }
}

/** Open the job card PDF for one or more orders in a new tab. Reading only — no order is changed. */
export function openJobCards(type: SourceType, ids: string[]) {
  if (!ids.length) return;
  window.open(jobCardPdfUrl(type, ids), "_blank", "noopener");
}

/**
 * Print Job Card for one order, with the card's number and production status.
 * The card is numbered the first time it is printed; reprints keep the number.
 */
export default function JobCardActions({
  type,
  orderId,
  eligible,
  canChangeStatus = false,
  compact = false,
}: {
  type: SourceType;
  orderId: string;
  eligible: boolean;
  canChangeStatus?: boolean;
  compact?: boolean;
}) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => fetchCard(type, orderId).then((c) => c !== undefined && setCard(c)), [type, orderId]);

  useEffect(() => {
    if (!compact) fetchCard(type, orderId).then((c) => c !== undefined && setCard(c));
  }, [type, orderId, compact]);

  async function print() {
    setError(null);
    setBusy(true);
    // Opened inside the click so the browser does not block it; filled once the PDF is ready.
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await fetch(jobCardPdfUrl(type, [orderId]), { method: "GET" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Job card could not be produced (${res.status}).`);
      }
      const url = URL.createObjectURL(await res.blob());
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      if (!compact) await load();
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Job card could not be produced.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: string) {
    if (!card) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not update the job card.");
      setCard(json.card);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the job card.");
    } finally {
      setBusy(false);
    }
  }

  if (!eligible) {
    return compact ? null : (
      <span className="text-[11px] font-semibold text-slate-400" title="Job cards are printed for received orders (not Draft or Cancelled).">
        No job card (draft/cancelled)
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void print()}
        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-800 disabled:opacity-50"
      >
        <ClipboardList size={14} />
        {busy ? "Preparing…" : "Print Job Card"}
      </button>
      {!compact && card ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600">
          {card.jobCardNumber}
          {canChangeStatus ? (
            <select
              value={card.status}
              disabled={busy}
              onChange={(e) => void changeStatus(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-800"
              aria-label="Job card production status"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <span className="rounded bg-slate-100 px-1.5 py-0.5">{card.status}</span>
          )}
        </span>
      ) : null}
      {error ? <span className="text-[11px] font-bold text-rose-700">{error}</span> : null}
    </span>
  );
}
