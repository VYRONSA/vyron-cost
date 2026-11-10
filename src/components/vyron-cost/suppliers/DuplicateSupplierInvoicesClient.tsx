"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, Notice, Pill, PrimaryButton, SecondaryButton, money } from "@/components/vyron-order-engine/ui";

type Row = {
  id: string;
  invoice_number: string;
  supplier_name: string | null;
  invoice_date: string | null;
  status: string | null;
  source_type: string | null;
  subtotal: number | null;
  total: number | null;
  created_at: string;
  notes: string | null;
  origin: "register" | "document";
  href: string;
  role: "original" | "duplicate" | "voided";
  lineCount: number;
  dependencies: string[];
  canVoid: boolean;
  canDelete: boolean;
  blockedReason: string | null;
};
type Group = { key: string; supplierName: string; invoiceNumber: string; rows: Row[]; amountsDiffer: boolean; datesDiffer: boolean; resolved: boolean };

const ROLE: Record<Row["role"], { label: string; tone: "green" | "amber" | "slate" }> = {
  original: { label: "Original (first captured)", tone: "green" },
  duplicate: { label: "Duplicate", tone: "amber" },
  voided: { label: "Voided", tone: "slate" },
};

async function fetchGroups(): Promise<{ ok: true; groups: Group[]; canResolve: boolean } | { ok: false; error: string }> {
  const data = await fetch("/api/supplier-invoices/duplicates", { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => ({ ok: false, error: "Duplicate invoices could not be loaded." }));
  return data.ok ? data : { ok: false, error: data.error || "Duplicate invoices could not be loaded." };
}

export default function DuplicateSupplierInvoicesClient() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [canResolve, setCanResolve] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [pending, setPending] = useState<{ row: Row; action: "void" | "delete" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const apply = useCallback((loaded: Awaited<ReturnType<typeof fetchGroups>>) => {
    if (!loaded.ok) {
      setMessage({ tone: "error", text: loaded.error });
      setGroups([]);
      return;
    }
    setGroups(loaded.groups);
    setCanResolve(loaded.canResolve);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void fetchGroups().then((loaded) => {
      if (!cancelled) apply(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/supplier-invoices/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: pending.row.id, action: pending.action, reason }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Action failed.");
      setMessage({ tone: "success", text: `Invoice ${pending.row.invoice_number} ${pending.action === "void" ? "voided (record kept as Cancelled)" : "deleted"}. Reason and your name are in the audit log.` });
      setPending(null);
      setReason("");
      apply(await fetchGroups());
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Action failed." });
    } finally {
      setBusy(false);
    }
  };

  const shown = (groups || []).filter((g) => showResolved || !g.resolved);
  const open = (groups || []).filter((g) => !g.resolved).length;

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Duplicate Supplier Invoices</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
          Invoices with the same supplier and invoice number captured more than once. Review each copy, then void the duplicate (the record is kept as Cancelled and drops out of
          purchases and reports). Only an unposted Draft/Captured copy with no dependencies can be deleted. Posted or paid invoices, invoices with stock movements, and Invoice
          Intelligence documents are never changed here. Every action needs a reason and is recorded with your name and the time.
        </p>
      </div>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {!canResolve && groups ? <Notice tone="info">You can review duplicates. Voiding needs the “Override invoice approval policy” permission.</Notice> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Pill tone={open ? "amber" : "green"}>{open} to review</Pill>
        <label className="flex items-center gap-2 text-xs font-black text-slate-600">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved
        </label>
      </div>
      {groups === null ? <p className="text-sm font-semibold text-slate-500">Loading…</p> : null}
      {groups && !shown.length ? <Card><p className="text-sm font-semibold text-slate-500">No duplicate supplier invoices to review.</p></Card> : null}
      {shown.map((g) => (
        <Card key={g.key} title={`${g.supplierName} · Invoice ${g.invoiceNumber}`} actions={g.resolved ? <Pill tone="green">Resolved</Pill> : <Pill tone="amber">{g.rows.filter((r) => r.role !== "voided").length} active copies</Pill>}>
          {g.amountsDiffer || g.datesDiffer ? (
            <div className="mb-3">
              <Notice tone="warning">
                The copies differ ({[g.amountsDiffer ? "amounts" : "", g.datesDiffer ? "dates" : ""].filter(Boolean).join(" and ")}). Check they really are the same invoice before voiding one.
              </Notice>
            </div>
          ) : null}
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Copy</th>
                  <th className="py-2 pr-3">Invoice date</th>
                  <th className="py-2 pr-3 text-right">Excl. VAT</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3">Status / source</th>
                  <th className="py-2 pr-3">Captured</th>
                  <th className="py-2 pr-3">Dependencies</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 align-top font-semibold text-slate-700">
                    <td className="py-2 pr-3">
                      <Pill tone={ROLE[r.role].tone}>{ROLE[r.role].label}</Pill>
                      <Link className="mt-1 block text-xs text-[#1F4757] hover:underline" href={r.href}>Open ({r.lineCount} line{r.lineCount === 1 ? "" : "s"})</Link>
                    </td>
                    <td className="py-2 pr-3">{r.invoice_date ? String(r.invoice_date).slice(0, 10) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.subtotal === null ? "—" : money(r.subtotal)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.total === null ? "—" : money(r.total)}</td>
                    <td className="py-2 pr-3">
                      {r.status || "—"}
                      <span className="block text-xs text-slate-400">{r.source_type || r.origin}</span>
                    </td>
                    <td className="py-2 pr-3 text-xs">{String(r.created_at).slice(0, 16).replace("T", " ")}</td>
                    <td className="py-2 pr-3 text-xs">{r.dependencies.length ? r.dependencies.map((d) => <div key={d}>{d}</div>) : <span className="text-slate-400">None</span>}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {canResolve && r.canVoid ? (
                        <>
                          <SecondaryButton tone="amber" onClick={() => { setPending({ row: r, action: "void" }); setReason(""); }}>Void</SecondaryButton>{" "}
                          {r.canDelete ? <SecondaryButton tone="rose" onClick={() => { setPending({ row: r, action: "delete" }); setReason(""); }}>Delete</SecondaryButton> : null}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">{r.blockedReason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pending && g.rows.some((r) => r.id === pending.row.id) ? (
            <div className="mt-4 grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid="duplicate-confirm">
              <p className="text-sm font-black text-slate-900">
                {pending.action === "void" ? "Void" : "Delete"} the copy captured {String(pending.row.created_at).slice(0, 10)} ({pending.row.total === null ? "no total" : money(pending.row.total)})?
                {pending.action === "delete" ? " It is removed permanently; a full copy is kept in the audit log." : " It stays on record as Cancelled."}
              </p>
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                Reason (required)
                <textarea className="min-h-[70px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case text-slate-800" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Same invoice captured twice — PDF re-sent by supplier" />
              </label>
              <div className="flex gap-2">
                <PrimaryButton disabled={busy || reason.trim().length < 10} onClick={() => void confirm()}>
                  Confirm {pending.action}
                </PrimaryButton>
                <SecondaryButton onClick={() => setPending(null)}>Cancel</SecondaryButton>
              </div>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
