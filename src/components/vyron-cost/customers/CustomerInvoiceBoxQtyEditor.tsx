"use client";

import { useState } from "react";
import { Package } from "lucide-react";

export type BoxQtyEditorLine = { id: string; description: string; qty: number; boxQty: number | null };

/** A stored or typed Box Qty as the screen holds it: null when none was entered. */
export function storedBoxQtyValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const qty = Number(value);
  return Number.isFinite(qty) ? qty : null;
}

function isInvalid(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const qty = Number(trimmed);
  return !Number.isFinite(qty) || qty < 0;
}

/**
 * Enter or correct Box Qty on an existing invoice — draft or issued.
 *
 * Box Qty is packing information typed by the user. Saving sends only Box Qty; Unit Qty,
 * prices, VAT and totals are shown read-only here and are never sent. The server refuses a
 * Cancelled invoice and records every change in the audit log.
 */
export default function CustomerInvoiceBoxQtyEditor({
  invoiceId,
  status,
  lines,
  canEdit,
  onSaved,
}: {
  invoiceId: string;
  status: string;
  lines: BoxQtyEditorLine[];
  canEdit: boolean;
  onSaved: (lines: Array<{ id: string; box_qty?: number | string | null }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  if (!canEdit || status === "Cancelled" || !lines.length) return null;

  function start() {
    setValues(Object.fromEntries(lines.map((line) => [line.id, line.boxQty === null ? "" : String(line.boxQty)])));
    setMessage(null);
    setOpen(true);
  }

  async function save() {
    const bad = lines.find((line) => isInvalid(values[line.id] ?? ""));
    if (bad) {
      setMessage({ tone: "error", text: `Box Qty on "${bad.description}" must be a number of 0 or more, or left empty.` });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/customer-invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boxQuantities: lines.map((line) => ({ lineId: line.id, boxQty: (values[line.id] ?? "").trim() || null })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Box Qty could not be saved.");
      onSaved(Array.isArray(data.lines) ? data.lines : []);
      setOpen(false);
      setMessage({ tone: "ok", text: data.changed ? `Box Qty saved on ${data.changed} line${data.changed === 1 ? "" : "s"}.` : "No Box Qty changed." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Box Qty could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-[24px] border border-blue-100 bg-white p-4" data-testid="box-qty-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Box Qty</p>
          <p className="text-sm font-semibold text-slate-500">
            Boxes per line, entered by you. Printed on the tax invoice. Unit Qty, prices, VAT and totals are not changed.
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-3 text-sm font-black text-white"
          >
            <Package size={17} />
            {lines.some((line) => line.boxQty !== null) ? "Edit Box Qty" : "Enter Box Qty"}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-4 space-y-2">
          {lines.map((line) => {
            const text = values[line.id] ?? "";
            const invalid = isInvalid(text);
            return (
              <div key={line.id} className="grid items-center gap-3 rounded-2xl border border-blue-50 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_110px_140px]">
                <span className="text-sm font-bold text-slate-900">{line.description}</span>
                <span className="text-sm font-semibold text-slate-500">Unit Qty {line.qty}</span>
                <label className="block">
                  <span className="sr-only">Box Qty for {line.description}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="-"
                    aria-label={`Box Qty for ${line.description}`}
                    aria-invalid={invalid}
                    value={text}
                    onChange={(event) => setValues((current) => ({ ...current, [line.id]: event.target.value }))}
                    className={`w-full rounded-xl border bg-white px-3 py-2 text-right text-sm font-bold outline-none ${invalid ? "border-rose-400" : "border-blue-100 focus:border-blue-400"}`}
                  />
                </label>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-2xl bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Box Qty"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setOpen(false);
                setMessage(null);
              }}
              className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p role="status" className={`mt-3 text-sm font-bold ${message.tone === "error" ? "text-rose-700" : "text-[#2F7C40]"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
