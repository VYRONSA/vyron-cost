"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Download, FileUp, Plus, Trash2 } from "lucide-react";
import { Card, Notice, NotEnabledNotice, PrimaryButton, SecondaryButton } from "@/components/vyron-order-engine/ui";

type DraftLine = { key: string; sku: string; description: string; quantity: string; unitPrice: string };

const TEMPLATE =
  "customer,po_number,requested_delivery_date,sku,description,quantity,unit_price\n" +
  "Example Customer,PO-1001,2026-10-01,SKU-001,Example product,10,25.00\n";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);
}

const emptyLine = (): DraftLine => ({ key: newKey(), sku: "", description: "", quantity: "", unitPrice: "" });

const inputClass = "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400";
const labelClass = "text-xs font-black uppercase tracking-[0.12em] text-slate-500";

export default function OrderIntakeCreateClient({ initialMode }: { initialMode: "manual" | "csv" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "csv">(initialMode);
  // One key per draft: a double-click or retry cannot create a second order.
  const idempotencyKey = useMemo(() => `form:${newKey()}`, []);
  const [customerName, setCustomerName] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [csvText, setCsvText] = useState("");
  const [csvName, setCsvName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);

  const setLine = (index: number, patch: Partial<DraftLine>) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/order-intake", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 && data.code === "NOT_ENABLED") {
        setNotEnabled(true);
        return;
      }
      if (!res.ok || !data.ok) throw new Error(data.error || "The order could not be received.");
      router.push(`/order-inbox/${data.intake.id}${data.duplicate ? "?duplicate=1" : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The order could not be received.");
      setBusy(false);
    }
  }

  function submitManual() {
    const filled = lines.filter((line) => line.sku.trim() || line.description.trim() || line.quantity.trim());
    void submit({
      kind: "manual",
      idempotencyKey,
      customerName,
      customerPoNumber: poNumber,
      requestedDeliveryDate: deliveryDate || null,
      notes,
      lines: filled.map((line) => ({
        sku: line.sku,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice.trim() === "" ? null : line.unitPrice,
      })),
    });
  }

  async function readFile(file: File | null) {
    setError(null);
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("The file is larger than 2 MB.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files can be imported here. Save an Excel sheet as CSV first.");
      return;
    }
    setCsvName(file.name);
    setCsvText(await file.text());
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "vyron-order-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <Link href="/order-inbox" className="text-sm font-black text-blue-700">
          ← Order Inbox
        </Link>
        <h1 className="mt-2 text-2xl font-black text-slate-900">New order</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
          Record the order exactly as the customer sent it. VYRON then matches the customer and products by exact identifiers only — anything it
          cannot match with certainty is raised for a person to resolve.
        </p>
      </div>

      {notEnabled ? <NotEnabledNotice /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="flex gap-1 self-start rounded-2xl bg-slate-100 p-1">
        {(["manual", "csv"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-xl px-4 py-2 text-sm font-black ${mode === m ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}
          >
            {m === "manual" ? "Enter manually" : "Import CSV"}
          </button>
        ))}
      </div>

      {mode === "manual" ? (
        <Card title="Order">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className={labelClass}>
              Customer (as on the order)
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} placeholder="Customer name" />
            </label>
            <label className={labelClass}>
              Customer PO number
              <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Requested delivery date
              <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Notes
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
            </label>
          </div>

          <div className="mt-6 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Lines</div>
          <div className="mt-2 grid gap-2">
            <div className="hidden grid-cols-[1fr_2fr_0.7fr_0.8fr_auto] gap-2 text-[10px] font-black uppercase tracking-[0.13em] text-slate-400 md:grid">
              <div>SKU / item code</div>
              <div>Description</div>
              <div>Quantity</div>
              <div>Unit price</div>
              <div />
            </div>
            {lines.map((line, index) => (
              <div key={line.key} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_0.7fr_0.8fr_auto]">
                <input aria-label="SKU" value={line.sku} onChange={(e) => setLine(index, { sku: e.target.value })} className={inputClass} placeholder="SKU" />
                <input aria-label="Description" value={line.description} onChange={(e) => setLine(index, { description: e.target.value })} className={inputClass} placeholder="Description" />
                <input aria-label="Quantity" inputMode="decimal" value={line.quantity} onChange={(e) => setLine(index, { quantity: e.target.value })} className={inputClass} placeholder="0" />
                <input aria-label="Unit price" inputMode="decimal" value={line.unitPrice} onChange={(e) => setLine(index, { unitPrice: e.target.value })} className={inputClass} placeholder="Blank = price list" />
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() => setLines((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current))}
                  className="mt-1 inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 text-slate-500 hover:bg-slate-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-3">
            <SecondaryButton onClick={() => setLines((current) => [...current, emptyLine()])}>
              <Plus size={15} /> Add line
            </SecondaryButton>
            <PrimaryButton onClick={submitManual} disabled={busy || notEnabled}>
              {busy ? "Receiving…" : "Receive order"}
            </PrimaryButton>
          </div>
        </Card>
      ) : (
        <Card
          title="Import a CSV order"
          actions={
            <SecondaryButton onClick={downloadTemplate}>
              <Download size={15} /> Template
            </SecondaryButton>
          }
        >
          <p className="text-sm font-semibold text-slate-600">
            One row per order line. Required columns: <b>quantity</b> and <b>sku</b> or <b>description</b>. Optional: customer, po_number,
            requested_delivery_date (YYYY-MM-DD), unit_price, discount, line_total, unit, line_ref. Importing the same file twice returns the order
            already received.
          </p>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-sm font-semibold text-slate-600 hover:border-blue-300">
            <FileUp size={22} />
            {csvName ? `${csvName} — ${csvText.split(/\r?\n/).filter((l) => l.trim()).length - 1} line(s)` : "Choose a .csv file"}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void readFile(e.target.files?.[0] || null)} />
          </label>
          <div className="mt-4 flex justify-end">
            <PrimaryButton onClick={() => void submit({ kind: "csv", text: csvText, fileName: csvName })} disabled={busy || !csvText || notEnabled}>
              {busy ? "Importing…" : "Import order"}
            </PrimaryButton>
          </div>
        </Card>
      )}
    </div>
  );
}
