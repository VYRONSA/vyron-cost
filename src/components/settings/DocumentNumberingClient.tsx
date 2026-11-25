"use client";

import { useCallback, useEffect, useState } from "react";

type Series = { seriesKey: string; prefix: string; padding: number; nextValue: number; issuedCount: number; nextNumber: string };
type RegisterRow = {
  series_key: string;
  sequence_value: number;
  document_number: string;
  document_type: string;
  document_id: string | null;
  disposition: string;
  issued_by: string;
  issued_at: string;
  note: string | null;
};

async function fetchNumbering() {
  const res = await fetch("/api/settings/document-numbering", { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return res.ok ? json : { ok: false, error: json.error || "Could not load document numbering." };
}

const SERIES_LABEL: Record<string, string> = {
  customer_invoice: "Customer Tax Invoices",
  job_card: "Production Job Cards",
};

/**
 * Document numbering — read the series, set a starting number before first use,
 * and audit every number issued. Numbers themselves are only ever issued by the
 * server when a document is issued; nothing here can rewind an issued series.
 */
export default function DocumentNumberingClient({ canConfigure }: { canConfigure: boolean }) {
  const [series, setSeries] = useState<Series[]>([]);
  const [register, setRegister] = useState<RegisterRow[]>([]);
  const [installed, setInstalled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { prefix: string; startAt: string }>>({});
  const [busy, setBusy] = useState(false);

  const apply = useCallback((json: { ok?: boolean; error?: string; installed?: boolean; series?: Series[]; register?: RegisterRow[] }) => {
    if (!json.ok) {
      setError(json.error || "Could not load document numbering.");
      return;
    }
    setError(null);
    setInstalled(Boolean(json.installed));
    setSeries(json.series || []);
    setRegister(json.register || []);
    setDraft(Object.fromEntries((json.series || []).map((s) => [s.seriesKey, { prefix: s.prefix, startAt: String(s.nextValue) }])));
  }, []);
  const load = useCallback(() => fetchNumbering().then(apply), [apply]);

  useEffect(() => {
    fetchNumbering().then(apply);
  }, [apply]);

  async function save(seriesKey: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const d = draft[seriesKey];
      const res = await fetch("/api/settings/document-numbering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesKey, prefix: d.prefix, startAt: Number(d.startAt) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not save.");
      setNotice(`${SERIES_LABEL[seriesKey] ?? seriesKey}: the first number will be ${d.prefix}${String(d.startAt).padStart(6, "0")}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700">
        <h2 className="text-lg font-black text-slate-900">How numbering works</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 font-semibold">
          <li>A new invoice is a Draft with a provisional <b>DRAFT-</b> reference. Drafts never consume invoice numbers.</li>
          <li>
            When the invoice is issued (Approved, Posted, Sent or Paid) the server takes the next number in this company&apos;s series
            in one database transaction. Two users issuing at the same moment always receive different numbers.
          </li>
          <li>An issued invoice can be cancelled but never deleted; its number stays on record and is never reused.</li>
          <li>
            Existing numbers are never changed: older SI- numbers, imported history and online-store invoices (WC-/SHP-) keep their
            own references.
          </li>
          <li>The prefix and starting number can be set only before the first number is issued in a series.</li>
        </ul>
      </section>
      {!installed ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
          Sequential numbering is not installed in this database yet. Invoices cannot be issued until it is.
        </div>
      ) : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{notice}</div> : null}
      <section className="grid gap-4 md:grid-cols-2">
        {series.map((s) => {
          const locked = s.issuedCount > 0;
          const d = draft[s.seriesKey] || { prefix: s.prefix, startAt: String(s.nextValue) };
          return (
            <div key={s.seriesKey} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-base font-black text-slate-900">{SERIES_LABEL[s.seriesKey] ?? s.seriesKey}</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <dt className="font-bold text-slate-500">Next number</dt>
                <dd className="font-black text-slate-900">{s.nextNumber}</dd>
                <dt className="font-bold text-slate-500">Numbers issued</dt>
                <dd className="font-black text-slate-900">{s.issuedCount}</dd>
              </dl>
              {canConfigure && !locked ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="text-[11px] font-black uppercase text-slate-500">
                    Prefix
                    <input
                      value={d.prefix}
                      onChange={(e) => setDraft({ ...draft, [s.seriesKey]: { ...d, prefix: e.target.value } })}
                      className="mt-1 block w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-bold text-slate-900"
                    />
                  </label>
                  <label className="text-[11px] font-black uppercase text-slate-500">
                    Start at
                    <input
                      type="number"
                      min={1}
                      value={d.startAt}
                      onChange={(e) => setDraft({ ...draft, [s.seriesKey]: { ...d, startAt: e.target.value } })}
                      className="mt-1 block w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-bold text-slate-900"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => save(s.seriesKey)}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-black text-white disabled:opacity-40"
                  >
                    Save series
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-[12px] font-semibold text-slate-500">
                  {locked
                    ? "Numbers have been issued in this series, so its prefix and starting number are locked."
                    : "Only a company administrator can set the starting number."}
                </p>
              )}
            </div>
          );
        })}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-black text-slate-900">Number register (latest 100)</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[11px] font-black uppercase text-slate-500">
              <tr>
                <th className="py-1.5">Number</th>
                <th>Series</th>
                <th>Disposition</th>
                <th>Issued by</th>
                <th>Issued at</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {register.map((r) => (
                <tr key={`${r.series_key}-${r.sequence_value}`} className="border-t border-slate-100">
                  <td className="py-1.5 font-black text-slate-900">{r.document_number}</td>
                  <td>{SERIES_LABEL[r.series_key] ?? r.series_key}</td>
                  <td className={r.disposition === "ISSUED" ? "font-bold text-emerald-700" : "font-bold text-amber-700"}>{r.disposition}</td>
                  <td>{r.issued_by}</td>
                  <td>{new Date(r.issued_at).toLocaleString("en-ZA")}</td>
                  <td className="text-[12px] text-slate-500">{r.note ?? ""}</td>
                </tr>
              ))}
              {register.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center font-semibold text-slate-500">
                    No numbers issued yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
