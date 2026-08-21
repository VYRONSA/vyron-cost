"use client";

import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Calculator, Pencil, Save, Trash2, X } from "lucide-react";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import StatusPill from "@/components/vyron-cost/StatusPill";

type Invoice = {
  id: string;
  invoice_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_date: string | null;
  status: string | null;
  source_type: string | null;
  file_name: string | null;
  duplicate_risk: boolean | null;
  matched_po_id: string | null;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

type Line = {
  id: string;
  invoice_id: string;
  ingredient_id: string | null;
  purchase_order_line_id: string | null;
  item_name: string;
  category: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  expected_unit_cost: number;
  variance_percent: number;
  vat_rate: number;
  line_excl: number;
  line_vat: number;
  line_total: number;
  sort_order: number;
};

type SupplierOption = { id: string; supplier_name: string };
type IngredientOption = { id: string; ingredient_name: string; purchase_unit: string | null };

const STATUSES = ["Draft", "Approved", "Posted", "Paid", "Cancelled"];

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export default function SupplierInvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const { canEdit, canDelete } = useModulePermissions("suppliers");

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingHeader, setEditingHeader] = useState(false);
  const [headerDraft, setHeaderDraft] = useState({
    supplierId: "",
    invoiceNumber: "",
    invoiceDate: "",
    status: "Draft",
    notes: "",
    sourceType: "",
  });

  const [editingLineId, setEditingLineId] = useState("");
  const [lineDraft, setLineDraft] = useState({
    itemName: "",
    quantity: "0",
    unit: "each",
    unitCost: "0",
    expectedUnitCost: "0",
    vatRate: "0",
    ingredientId: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/supplier-invoices/${invoiceId}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || "Could not load the invoice.");
        return;
      }
      setInvoice(data.invoice);
      setLines(data.lines || []);
      setSuppliers(data.suppliers || []);
      setIngredients(data.ingredients || []);
      setNotFound(false);
    } catch {
      setMessage("Could not reach the supplier invoice service.");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ingredientById = useMemo(
    () => new Map(ingredients.map((item) => [item.id, item])),
    [ingredients]
  );

  const lineTotals = useMemo(
    () => ({
      excl: lines.reduce((sum, line) => sum + Number(line.line_excl || 0), 0),
      vat: lines.reduce((sum, line) => sum + Number(line.line_vat || 0), 0),
      total: lines.reduce((sum, line) => sum + Number(line.line_total || 0), 0),
    }),
    [lines]
  );

  /**
   * Mirrors deriveSupplierInvoiceTotals() on the server: the subtotal is
   * derived from the lines, but VAT only becomes line-derived once a line
   * actually carries a VAT rate. Until then the captured header VAT stands,
   * because a rate that was never captured is unknown, not zero.
   */
  const linesCarryVat = useMemo(
    () => lines.some((line) => Number(line.vat_rate || 0) > 0),
    [lines]
  );
  const derived = useMemo(() => {
    const subtotal = Math.round(lineTotals.excl * 100) / 100;
    const vat = linesCarryVat
      ? Math.round(lineTotals.vat * 100) / 100
      : Math.round(Number(invoice?.vat || 0) * 100) / 100;
    return { subtotal, vat, total: Math.round((subtotal + vat) * 100) / 100 };
  }, [lineTotals.excl, lineTotals.vat, linesCarryVat, invoice?.vat]);

  const subtotalAgrees =
    invoice !== null && Math.abs(Number(invoice.subtotal || 0) - derived.subtotal) < 0.01;
  const headerAgrees =
    invoice !== null && subtotalAgrees && Math.abs(Number(invoice.total || 0) - derived.total) < 0.01;

  function openHeaderEditor() {
    if (!invoice) return;
    setHeaderDraft({
      supplierId: invoice.supplier_id || "",
      invoiceNumber: invoice.invoice_number || "",
      invoiceDate: invoice.invoice_date || "",
      status: String(invoice.status || "Draft"),
      notes: invoice.notes || "",
      sourceType: invoice.source_type || "",
    });
    setEditingHeader(true);
    setMessage("");
  }

  async function saveHeader() {
    setSaving(true);
    try {
      const res = await fetch(`/api/supplier-invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: headerDraft.supplierId || undefined,
          invoiceNumber: headerDraft.invoiceNumber,
          invoiceDate: headerDraft.invoiceDate || null,
          status: headerDraft.status,
          notes: headerDraft.notes,
          sourceType: headerDraft.sourceType || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || "Save failed.");
        return;
      }
      setEditingHeader(false);
      setMessage("Invoice header saved.");
      await load();
    } catch {
      setMessage("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function openLineEditor(line: Line) {
    setEditingLineId(line.id);
    setLineDraft({
      itemName: line.item_name || "",
      quantity: String(line.quantity ?? 0),
      unit: line.unit || "each",
      unitCost: String(line.unit_cost ?? 0),
      expectedUnitCost: String(line.expected_unit_cost ?? 0),
      vatRate: String(line.vat_rate ?? 0),
      ingredientId: line.ingredient_id || "",
    });
    setMessage("");
  }

  async function saveLine() {
    if (!headerAgrees) {
      const confirmed = window.confirm(
        "Saving this line restates the invoice header from all lines." +
          `\n\nSubtotal moves from ${money(invoice?.subtotal)} to ${money(derived.subtotal)}.\n` +
          (linesCarryVat
            ? `VAT is taken from the line VAT rates: ${money(derived.vat)}.\n`
            : `VAT stays at the captured ${money(derived.vat)}. No line carries a VAT rate, so line VAT is unknown rather than zero.\n`) +
          `Total becomes ${money(derived.total)}.\n\nContinue?`
      );
      if (!confirmed) return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/supplier-invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateLine",
          lineId: editingLineId,
          itemName: lineDraft.itemName,
          quantity: Number(lineDraft.quantity),
          unit: lineDraft.unit,
          unitCost: Number(lineDraft.unitCost),
          expectedUnitCost: Number(lineDraft.expectedUnitCost),
          vatRate: Number(lineDraft.vatRate),
          ingredientId: lineDraft.ingredientId || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || "Line save failed.");
        return;
      }
      setEditingLineId("");
      setMessage("Line saved — invoice totals recalculated from the lines.");
      await load();
    } catch {
      setMessage("Line save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function recalculateTotals() {
    if (!invoice) return;
    const confirmed = window.confirm(
      `Recalculate the header of ${invoice.invoice_number} from its lines?\n\n` +
        `Subtotal goes from ${money(invoice.subtotal)} to ${money(derived.subtotal)}.\n` +
        (linesCarryVat
          ? `VAT is taken from the line VAT rates: ${money(derived.vat)}.\n`
          : `VAT stays at the captured ${money(derived.vat)}, preserved rather than derived to zero.\n`) +
        `Total goes from ${money(invoice.total)} to ${money(derived.total)}.`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/supplier-invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recalculateTotals" }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || "Recalculation failed.");
        return;
      }
      setMessage("Header recalculated from the invoice lines.");
      await load();
    } catch {
      setMessage("Recalculation failed.");
    } finally {
      setSaving(false);
    }
  }

  async function removeInvoice() {
    if (!invoice) return;
    const confirmed = window.confirm(
      `Delete supplier invoice ${invoice.invoice_number} from ${invoice.supplier_name || "this supplier"}?\n\n` +
        `This permanently removes the invoice and its ${lines.length} line${lines.length === 1 ? "" : "s"}.\n` +
        `The supplier and all linked ingredients are kept.\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/supplier-invoices/${invoiceId}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || "Delete failed.");
        return;
      }
      router.push("/supplier-invoices");
    } catch {
      setMessage("Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <VyronPremiumPageShell
        config={{ visualVariant: "suppliers", title: "Supplier Invoice", subtitle: "Loading invoice…" }}
        showFormulas={false}
        showIntelligence={false}
      >
        <div className="rounded-[32px] border border-white/70 bg-white/90 p-10 text-center text-sm font-bold text-slate-500">
          Loading invoice…
        </div>
      </VyronPremiumPageShell>
    );
  }

  if (notFound || !invoice) {
    return (
      <VyronPremiumPageShell
        config={{
          visualVariant: "suppliers",
          title: "Supplier Invoice",
          subtitle: "This invoice is not available in the active workspace.",
        }}
        showFormulas={false}
        showIntelligence={false}
      >
        <div className="rounded-[32px] border border-white/70 bg-white/90 p-10 text-center">
          <p className="text-sm font-bold text-slate-600">
            Invoice not found for the active company.
          </p>
          <Link
            href="/supplier-invoices"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2 text-xs font-black text-indigo-800"
          >
            <ArrowLeft size={14} />
            Back to Supplier Invoices
          </Link>
        </div>
      </VyronPremiumPageShell>
    );
  }

  return (
    <VyronPremiumPageShell
      dense
      panelsBelowContent
      config={{
        visualVariant: "suppliers",
        badge: "Premium Procurement Workspace",
        title: `Invoice ${invoice.invoice_number}`,
        subtitle: `${invoice.supplier_name || "Unlinked supplier"} — ${lines.length} line${
          lines.length === 1 ? "" : "s"
        }, ${money(invoice.total)} including VAT.`,
        outcomes: [
          "Review the captured header against the supplier document",
          "Correct a mis-read line and let the totals recalculate",
          "Track price variance against expected unit cost",
        ],
      }}
      showFormulas={false}
      showIntelligence={false}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/supplier-invoices"
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.09)] bg-white/80 px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-white"
          >
            <ArrowLeft size={14} />
            All invoices
          </Link>
          {canEdit && !editingHeader ? (
            <button
              onClick={openHeaderEditor}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2 text-xs font-black text-indigo-800 transition hover:bg-indigo-100"
            >
              <Pencil size={14} />
              Edit invoice
            </button>
          ) : null}
          {canDelete ? (
            <button
              onClick={() => void removeInvoice()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
            >
              <Trash2 size={14} />
              Delete
            </button>
          ) : null}
        </div>
      }
    >
      {message ? (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-2.5 text-sm font-bold text-indigo-900">
          {message}
        </div>
      ) : null}

      {!headerAgrees ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-black">
                Header {money(invoice.total)} does not match the restated {money(derived.total)} — a gap of{" "}
                {money(Number(invoice.total || 0) - derived.total)}.
              </p>
              <p className="mt-1 font-semibold">
                {subtotalAgrees
                  ? "The line subtotal agrees with the header."
                  : `The lines sum to ${money(derived.subtotal)} excl VAT against a header subtotal of ${money(invoice.subtotal)}.`}{" "}
                {linesCarryVat
                  ? "VAT is derived from the line VAT rates."
                  : "No line carries a VAT rate, so line VAT is unknown rather than zero: the captured header VAT is preserved and never derived away."}{" "}
                The header is left exactly as imported; editing the supplier, number, date or status will not move it.
              </p>
              {canEdit ? (
                <button
                  onClick={() => void recalculateTotals()}
                  disabled={saving}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-900 transition hover:bg-amber-200 disabled:opacity-50"
                >
                  <Calculator size={13} />
                  Recalculate header from lines
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ---- header ---- */}
      <section className="rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(30,41,59,0.06)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">Invoice header</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Captured {invoice.created_at?.slice(0, 10)}
              {invoice.updated_at ? ` · last amended ${invoice.updated_at.slice(0, 10)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {invoice.duplicate_risk ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-amber-800">
                <AlertTriangle size={12} />
                Duplicate risk
              </span>
            ) : null}
            <StatusPill status={String(invoice.status || "Draft")} />
          </div>
        </div>

        {editingHeader ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Supplier</span>
              <select
                value={headerDraft.supplierId}
                onChange={(event) => setHeaderDraft({ ...headerDraft, supplierId: event.target.value })}
                className="mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              >
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.supplier_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Invoice number</span>
              <input
                value={headerDraft.invoiceNumber}
                onChange={(event) => setHeaderDraft({ ...headerDraft, invoiceNumber: event.target.value })}
                className="mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Invoice date</span>
              <input
                type="date"
                value={headerDraft.invoiceDate}
                onChange={(event) => setHeaderDraft({ ...headerDraft, invoiceDate: event.target.value })}
                className="mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Status</span>
              <select
                value={headerDraft.status}
                onChange={(event) => setHeaderDraft({ ...headerDraft, status: event.target.value })}
                className="mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Source type</span>
              <input
                value={headerDraft.sourceType}
                onChange={(event) => setHeaderDraft({ ...headerDraft, sourceType: event.target.value })}
                className="mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>
            <label className="md:col-span-2 lg:col-span-3">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                Reference / notes
              </span>
              <textarea
                value={headerDraft.notes}
                onChange={(event) => setHeaderDraft({ ...headerDraft, notes: event.target.value })}
                rows={2}
                className="mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>
            <div className="flex flex-wrap gap-2 md:col-span-2 lg:col-span-3">
              <button
                onClick={() => void saveHeader()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? "Saving…" : "Save invoice"}
              </button>
              <button
                onClick={() => setEditingHeader(false)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-700"
              >
                <X size={14} />
                Cancel
              </button>
              <p className="w-full text-xs font-semibold text-slate-500">
                Subtotal, VAT and total are always recalculated from the invoice lines — they are not entered here.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Supplier", value: invoice.supplier_name || "—" },
              { label: "Invoice number", value: invoice.invoice_number },
              { label: "Invoice date", value: invoice.invoice_date || "—" },
              { label: "Status", value: String(invoice.status || "Draft") },
              { label: "Source / type", value: invoice.source_type || "—" },
              { label: "Source file", value: invoice.file_name || "—" },
              { label: "Matched PO", value: invoice.matched_po_id ? invoice.matched_po_id : "Not matched" },
              { label: "Duplicate risk", value: invoice.duplicate_risk ? "Flagged" : "Clear" },
              { label: "Subtotal excl VAT", value: money(invoice.subtotal) },
              { label: "VAT", value: money(invoice.vat) },
              { label: "Total incl VAT", value: money(invoice.total) },
              { label: "Reference / notes", value: invoice.notes || "—" },
            ].map((field) => (
              <div key={field.label}>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{field.label}</p>
                <p className="mt-1 break-words text-sm font-black text-slate-950">{field.value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- lines ---- */}
      <section className="rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(30,41,59,0.06)]">
        <div className="mb-4">
          <h2 className="text-xl font-black text-slate-950">Invoice lines</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {lines.length} line{lines.length === 1 ? "" : "s"}. Line excl, VAT and total are derived by the database
            from quantity, unit price and VAT rate.
          </p>
        </div>

        <EnterpriseScrollContainer mode="page" className="rounded-[24px] border border-indigo-100">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.12em] text-white">
              <tr>
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="px-4 py-2.5">Ingredient link</th>
                <th className="px-4 py-2.5 text-right">Qty</th>
                <th className="px-4 py-2.5">Unit</th>
                <th className="px-4 py-2.5 text-right">Unit price</th>
                <th className="px-4 py-2.5 text-right">Expected</th>
                <th className="px-4 py-2.5 text-right">Variance</th>
                <th className="px-4 py-2.5 text-right">VAT %</th>
                <th className="px-4 py-2.5 text-right">Line excl</th>
                <th className="px-4 py-2.5 text-right">Line VAT</th>
                <th className="px-4 py-2.5 text-right">Line total</th>
                <th className="px-4 py-2.5">PO line</th>
                <th className="px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) =>
                editingLineId === line.id ? (
                  <tr key={line.id} className="border-t border-indigo-100 bg-indigo-50/50">
                    <td className="px-4 py-2.5 font-black text-slate-500">{index + 1}</td>
                    <td className="px-4 py-2.5">
                      <input
                        value={lineDraft.itemName}
                        onChange={(event) => setLineDraft({ ...lineDraft, itemName: event.target.value })}
                        className="w-full min-w-[220px] rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-sm font-semibold outline-none"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={lineDraft.ingredientId}
                        onChange={(event) => setLineDraft({ ...lineDraft, ingredientId: event.target.value })}
                        className="w-full min-w-[180px] rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-sm font-semibold outline-none"
                      >
                        <option value="">Not linked</option>
                        {ingredients.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.ingredient_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        step="any"
                        value={lineDraft.quantity}
                        onChange={(event) => setLineDraft({ ...lineDraft, quantity: event.target.value })}
                        className="w-24 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-right text-sm font-semibold outline-none"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        value={lineDraft.unit}
                        onChange={(event) => setLineDraft({ ...lineDraft, unit: event.target.value })}
                        className="w-20 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-sm font-semibold outline-none"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        step="any"
                        value={lineDraft.unitCost}
                        onChange={(event) => setLineDraft({ ...lineDraft, unitCost: event.target.value })}
                        className="w-28 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-right text-sm font-semibold outline-none"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        step="any"
                        value={lineDraft.expectedUnitCost}
                        onChange={(event) => setLineDraft({ ...lineDraft, expectedUnitCost: event.target.value })}
                        className="w-28 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-right text-sm font-semibold outline-none"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-bold text-slate-500">auto</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        step="any"
                        value={lineDraft.vatRate}
                        onChange={(event) => setLineDraft({ ...lineDraft, vatRate: event.target.value })}
                        className="w-20 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-right text-sm font-semibold outline-none"
                      />
                    </td>
                    <td colSpan={3} className="px-4 py-2.5 text-right text-xs font-bold text-slate-500">
                      Recalculated on save
                    </td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-500">
                      {line.purchase_order_line_id ? "linked" : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void saveLine()}
                          disabled={saving}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingLineId("")}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={line.id} className="border-t border-indigo-50 transition hover:bg-indigo-50/30">
                    <td className="px-4 py-2.5 font-black text-slate-400">{index + 1}</td>
                    <td className="px-4 py-2.5 font-black text-slate-950">{line.item_name}</td>
                    <td className="px-4 py-2.5 text-xs font-bold">
                      {line.ingredient_id ? (
                        <span className="text-emerald-700">
                          {ingredientById.get(line.ingredient_id)?.ingredient_name || "Linked"}
                        </span>
                      ) : (
                        <span className="text-slate-400">Not linked</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{line.quantity}</td>
                    <td className="px-4 py-2.5 text-xs font-bold uppercase text-slate-500">{line.unit}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{money(line.unit_cost)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-500">
                      {Number(line.expected_unit_cost) > 0 ? money(line.expected_unit_cost) : "—"}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-black tabular-nums ${
                        Number(line.variance_percent) > 0
                          ? "text-rose-700"
                          : Number(line.variance_percent) < 0
                            ? "text-emerald-700"
                            : "text-slate-400"
                      }`}
                    >
                      {Number(line.variance_percent) !== 0 ? `${Number(line.variance_percent).toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{Number(line.vat_rate)}%</td>
                    <td className="px-4 py-2.5 text-right font-black tabular-nums">{money(line.line_excl)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{money(line.line_vat)}</td>
                    <td className="px-4 py-2.5 text-right font-black tabular-nums">{money(line.line_total)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-500">
                      {line.purchase_order_line_id ? (
                        <span className="text-emerald-700">Matched</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {canEdit ? (
                        <button
                          onClick={() => openLineEditor(line)}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-800 transition hover:bg-indigo-100"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              )}

              {lines.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
                    This invoice has no captured lines.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {lines.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-slate-950 bg-slate-50 font-black text-slate-950">
                  <td colSpan={9} className="px-4 py-2.5 text-right uppercase tracking-[0.1em]">
                    Invoice totals
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(lineTotals.excl)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(lineTotals.vat)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(lineTotals.total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </EnterpriseScrollContainer>
      </section>
    </VyronPremiumPageShell>
  );
}
