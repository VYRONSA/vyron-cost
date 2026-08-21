"use client";

import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, FileSearch, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import StatusPill from "@/components/vyron-cost/StatusPill";

type SupplierInvoice = {
  id: string;
  invoice_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_date: string | null;
  status: string | null;
  source_type: string | null;
  duplicate_risk: boolean | null;
  matched_po_id: string | null;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
};

type SupplierOption = { id: string; supplier_name: string };

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

const ALL = "__all__";

export default function SupplierInvoicesClient() {
  const { canDelete } = useModulePermissions("suppliers");

  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [lineCounts, setLineCounts] = useState<Record<string, number>>({});
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  // filters
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/supplier-invoices", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || "Could not load supplier invoices.");
        setInvoices([]);
        return;
      }
      setInvoices(data.invoices || []);
      setLineCounts(data.lineCounts || {});
      setSuppliers(data.suppliers || []);
      setMessage("");
    } catch {
      setMessage("Could not reach the supplier invoice service.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((invoice) => set.add(String(invoice.status || "Draft")));
    return [...set].sort();
  }, [invoices]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const min = amountMin.trim() === "" ? null : Number(amountMin);
    const max = amountMax.trim() === "" ? null : Number(amountMax);

    return invoices.filter((invoice) => {
      if (supplierFilter !== ALL && invoice.supplier_id !== supplierFilter) return false;
      if (statusFilter !== ALL && String(invoice.status || "Draft") !== statusFilter) return false;
      if (dateFrom && String(invoice.invoice_date || "") < dateFrom) return false;
      if (dateTo && String(invoice.invoice_date || "") > dateTo) return false;

      const total = Number(invoice.total || 0);
      if (min !== null && Number.isFinite(min) && total < min) return false;
      if (max !== null && Number.isFinite(max) && total > max) return false;

      if (term) {
        const haystack = [
          invoice.invoice_number,
          invoice.supplier_name,
          invoice.status,
          invoice.source_type,
          invoice.invoice_date,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [invoices, search, supplierFilter, statusFilter, dateFrom, dateTo, amountMin, amountMax]);

  const totals = useMemo(
    () => ({
      count: filtered.length,
      lines: filtered.reduce((sum, invoice) => sum + (lineCounts[invoice.id] || 0), 0),
      excl: filtered.reduce((sum, invoice) => sum + Number(invoice.subtotal || 0), 0),
      vat: filtered.reduce((sum, invoice) => sum + Number(invoice.vat || 0), 0),
      total: filtered.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0),
    }),
    [filtered, lineCounts]
  );

  const filtersActive =
    Boolean(search.trim()) ||
    supplierFilter !== ALL ||
    statusFilter !== ALL ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(amountMin) ||
    Boolean(amountMax);

  function clearFilters() {
    setSearch("");
    setSupplierFilter(ALL);
    setStatusFilter(ALL);
    setDateFrom("");
    setDateTo("");
    setAmountMin("");
    setAmountMax("");
  }

  async function removeInvoice(invoice: SupplierInvoice) {
    const lines = lineCounts[invoice.id] || 0;
    const confirmed = window.confirm(
      `Delete supplier invoice ${invoice.invoice_number} from ${invoice.supplier_name || "this supplier"}?\n\n` +
        `This permanently removes the invoice and its ${lines} line${lines === 1 ? "" : "s"}.\n` +
        `The supplier and all linked ingredients are kept.\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setBusyId(invoice.id);
    try {
      const res = await fetch(`/api/supplier-invoices/${invoice.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || "Delete failed.");
        return;
      }
      setMessage(`Deleted ${invoice.invoice_number} and ${data.deletedLines ?? lines} line(s).`);
      await load();
    } catch {
      setMessage("Delete failed.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <VyronPremiumPageShell
      dense
      panelsBelowContent
      config={{
        visualVariant: "suppliers",
        badge: "Premium Procurement Workspace",
        title: "Supplier Invoices",
        subtitle:
          "Every supplier invoice already captured — search it, open it, correct it, or remove it. Importing stays in the Import Centre; this is where imported invoices are managed.",
        outcomes: [
          "Find any supplier invoice by supplier, number, date, status or amount",
          "Open the full header and every captured line",
          "Amend a mis-captured invoice and keep header and lines in agreement",
          "Delete an invoice and its lines without touching supplier or ingredient master data",
        ],
        formulaTitle: "Supplier invoice formulas",
        formulas: [
          { label: "Line excl", formula: "Quantity × Unit price" },
          { label: "Line VAT", formula: "Line excl × VAT rate ÷ 100" },
          { label: "Invoice subtotal", formula: "Σ Line excl" },
          { label: "Invoice VAT", formula: "Σ Line VAT, or the captured header VAT while no line carries a rate" },
          { label: "Invoice total", formula: "Subtotal + VAT" },
          { label: "Price variance", formula: "(Unit price − Expected) ÷ Expected × 100" },
        ],
        intelligenceTitle: "What to watch",
        intelligenceItems: [
          { label: "Duplicate risk", detail: "A repeated supplier and invoice number pair is the most common double payment." },
          { label: "Price variance", detail: "A line above its expected unit cost is margin leaving the business quietly." },
          { label: "Unmatched lines", detail: "A line with no ingredient link never reaches costing or stock valuation." },
        ],
      }}
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.09)] bg-white/80 px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-white"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <Link
            href="/import-centre"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2 text-xs font-black text-indigo-800 transition hover:bg-indigo-100"
          >
            <Upload size={14} />
            Import Centre
          </Link>
          <Link
            href="/document-intelligence"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2 text-xs font-black text-violet-800 transition hover:bg-violet-100"
          >
            <FileSearch size={14} />
            Document Intelligence
          </Link>
        </div>
      }
    >
      {message ? (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm font-bold text-indigo-900">
          {message}
        </div>
      ) : null}

      {/* ---- summary ---- */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Invoices", value: String(totals.count) },
          { label: "Invoice lines", value: String(totals.lines) },
          { label: "Total excl VAT", value: money(totals.excl) },
          { label: "VAT", value: money(totals.vat) },
          { label: "Total incl VAT", value: money(totals.total) },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-[0_18px_60px_rgba(30,41,59,0.06)]"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{tile.label}</p>
            <p className="mt-1 text-xl font-black text-slate-950">{tile.value}</p>
          </div>
        ))}
      </section>

      {/* ---- filters ---- */}
      {/*
        Filters sit in one compact band. The card previously restated the page
        purpose in a heading and a sentence above two rows of controls, which
        cost ~130px of the fold on a register whose whole job is showing rows.
        Every control is unchanged - only the chrome around them is smaller.
      */}
      <section className="rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-[0_18px_60px_rgba(30,41,59,0.06)]">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          <label className="lg:col-span-2 2xl:col-span-1">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
            <span className="mt-1 flex items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2">
              <Search size={15} className="text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Invoice number, supplier, status…"
                className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
              />
            </span>
          </label>

          <label>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Supplier</span>
            <select
              value={supplierFilter}
              onChange={(event) => setSupplierFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
            >
              <option value={ALL}>All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.supplier_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
            >
              <option value={ALL}>All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Date from</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
            />
          </label>
          <label>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Date to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
            />
          </label>
          <label>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Amount from</span>
            <input
              type="number"
              inputMode="decimal"
              value={amountMin}
              onChange={(event) => setAmountMin(event.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
            />
          </label>
          <label>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Amount to</span>
            <input
              type="number"
              inputMode="decimal"
              value={amountMax}
              onChange={(event) => setAmountMax(event.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
            />
          </label>

          {filtersActive ? (
            <div className="flex items-end">
              <button
                onClick={clearFilters}
                className="w-full rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-200"
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* ---- register ---- */}
      <section className="rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-[0_18px_60px_rgba(30,41,59,0.06)]">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-lg font-black text-slate-950">Supplier Invoice Register</h2>
          <p className="text-sm font-semibold text-slate-500">
            Showing {filtered.length} of {invoices.length} processed invoice{invoices.length === 1 ? "" : "s"}.
          </p>
        </div>

        <EnterpriseScrollContainer mode="page" className="rounded-[24px] border border-indigo-100">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.12em] text-white">
              <tr>
                <th className="whitespace-nowrap px-4 py-3">Invoice</th>
                <th className="whitespace-nowrap px-4 py-3">Supplier</th>
                <th className="whitespace-nowrap px-4 py-3">Invoice date</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Lines</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Subtotal</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">VAT</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Total</th>
                <th className="whitespace-nowrap px-4 py-3">Status</th>
                <th className="whitespace-nowrap px-4 py-3">Source / PO</th>
                <th className="whitespace-nowrap px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((invoice) => (
                <tr key={invoice.id} className="border-t border-indigo-50 transition hover:bg-indigo-50/40">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <Link
                      href={`/supplier-invoices/${invoice.id}`}
                      className="font-black text-indigo-700 underline-offset-2 hover:underline"
                    >
                      {invoice.invoice_number}
                    </Link>
                    {invoice.duplicate_risk ? (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-800">
                        <AlertTriangle size={11} />
                        Duplicate risk
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-black text-slate-950">{invoice.supplier_name || "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-semibold text-slate-600">{invoice.invoice_date || "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-right font-semibold text-slate-600">
                    {lineCounts[invoice.id] ?? 0}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-right font-black tabular-nums">{money(invoice.subtotal)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-right font-black tabular-nums">{money(invoice.vat)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-right font-black tabular-nums">{money(invoice.total)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <StatusPill status={String(invoice.status || "Draft")} />
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                    {invoice.source_type || "—"}
                    {invoice.matched_po_id ? <span className="block text-emerald-700">PO matched</span> : null}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex flex-nowrap items-center gap-1.5">
                      <Link
                        href={`/supplier-invoices/${invoice.id}`}
                        className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-black text-indigo-800 transition hover:bg-indigo-100"
                      >
                        Open
                      </Link>
                      {canDelete ? (
                        <button
                          onClick={() => void removeInvoice(invoice)}
                          disabled={busyId === invoice.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                          {busyId === invoice.id ? "Deleting…" : "Delete"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}

              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
                    Loading supplier invoices…
                  </td>
                </tr>
              ) : null}
              {!loading && invoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
                    No supplier invoices captured yet. Import them from the Import Centre.
                  </td>
                </tr>
              ) : null}
              {!loading && invoices.length > 0 && filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
                    No invoices match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </EnterpriseScrollContainer>
      </section>
    </VyronPremiumPageShell>
  );
}
