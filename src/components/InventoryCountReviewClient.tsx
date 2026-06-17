"use client";

import Link from "next/link";
import { Download, Printer, Save, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";
import { useInventoryPermissions } from "@/hooks/useModulePermissions";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";

type LineRow = Record<string, unknown>;

function num(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function stockName(line: LineRow) {
  const stock = line.vyron_cost_stock_items as Record<string, unknown> | undefined;
  return String(stock?.description || stock?.item_code || line.stock_item_id || "Stock item");
}

function stockUnit(line: LineRow) {
  const stock = line.vyron_cost_stock_items as Record<string, unknown> | undefined;
  return String(stock?.unit || "unit");
}

export default function InventoryCountReviewClient({ countId }: { countId: string }) {
  const { canCreateCount, canApproveCount, canPostAdjustment } = useInventoryPermissions();
  const [count, setCount] = useState<Record<string, unknown> | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setMessage("");
    const { query } = poApiWorkspaceContext();
    const res = await fetch(`/api/inventory/counts/${countId}${query}`, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) {
      setCount(data.count);
      setLines((data.lines || []).map((line: LineRow) => ({ ...line, draft_counted_qty: line.counted_qty })));
    } else {
      setMessage(data.error || "Could not load count.");
    }
  }, [countId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(name: string, extra?: Record<string, unknown>) {
    if ((name === "approve" && !canApproveCount) || (name === "post" && !canPostAdjustment) || ((name === "start" || name === "submit") && !canCreateCount)) {
      setMessage("You do not have permission for this stock count action.");
      return;
    }
    const labels: Record<string, string> = {
      start: "start this stock count",
      submit: "submit this stock count for approval",
      approve: "approve these variances",
      post: "post these variances to the stock ledger",
    };
    if (name !== "start" && !window.confirm(`Are you sure you want to ${labels[name] || name}?`)) return;
    const { body: workspaceBody } = poApiWorkspaceContext();
    const res = await fetch(`/api/inventory/counts/${countId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...workspaceBody, action: name, ...extra }),
    });
    const data = await res.json();
    setMessage(data.ok ? `${name} completed.` : data.error || "Failed");
    await load();
  }

  function updateDraftLine(lineId: string, countedQty: number) {
    setLines((current) => current.map((line) => (String(line.id) === lineId ? { ...line, draft_counted_qty: countedQty } : line)));
  }

  async function saveLines() {
    if (!canCreateCount) {
      setMessage("You do not have permission to save stock counts.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      for (const line of lines) {
        const countedQty = num(line.draft_counted_qty);
        if (countedQty === num(line.counted_qty)) continue;
        const { body: workspaceBody } = poApiWorkspaceContext();
        const res = await fetch(`/api/inventory/counts/${countId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...workspaceBody, action: "updateLine", lineId: String(line.id), countedQty }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "Could not save a count line.");
      }
      setMessage("Count lines saved and variances recalculated.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save count lines.");
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const header = ["Item", "System", "Counted", "Variance", "Variance %", "Variance Value", "Class"];
    const rows = filtered.map((line) => [
      stockName(line),
      String(num(line.system_qty)),
      String(num(line.draft_counted_qty ?? line.counted_qty)),
      String(num(line.variance_qty)),
      String(num(line.variance_pct)),
      String(num(line.variance_value)),
      String(line.variance_class || "minor"),
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vyron-cost-stock-count-${String(count?.count_number || countId)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return lines;
    return lines.filter((line) => [stockName(line), line.variance_class, line.stock_item_id].join(" ").toLowerCase().includes(term));
  }, [lines, search]);

  const totals = useMemo(() => {
    const system = lines.reduce((sum, line) => sum + num(line.system_qty), 0);
    const counted = lines.reduce((sum, line) => sum + num(line.draft_counted_qty ?? line.counted_qty), 0);
    const varianceQty = counted - system;
    const varianceValue = lines.reduce((sum, line) => {
      const countedLine = num(line.draft_counted_qty ?? line.counted_qty);
      const systemLine = num(line.system_qty);
      const cost = num(line.unit_cost);
      return sum + Math.abs((countedLine - systemLine) * cost);
    }, 0);
    return { system, counted, varianceQty, varianceValue };
  }, [lines]);

  if (!count) return <p className="text-sm font-bold text-slate-500">{message || "Loading count…"}</p>;

  const status = String(count.status || "Draft");
  const editable = status === "Draft" || status === "In Progress";

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "inventory",
        badge: "Count Intelligence",
        title: "Inventory Count Review Centre",
        subtitle: "Validate count variances, approvals, and ledger posting controls in a premium review workspace.",
        outcomes: ["Improve variance accuracy before posting", "Enforce approval controls by status", "Export and print count evidence quickly"],
        formulas: ["Variance Qty = Counted Qty - System Qty", "Variance % = Variance Qty / System Qty", "Variance Value = |Variance Qty x Unit Cost|"],
        intelligenceItems: [
          { label: "Count status", detail: status },
          { label: "Editable lines", detail: `${filtered.length} filtered lines in current review` },
          { label: "Variance value", detail: formatMoney(totals.varianceValue) },
        ],
      }}
    >
      <section className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <Link href="/inventory/counts" className="text-sm font-black text-violet-700">← Back to Stock Counts</Link>
          <h1 className="mt-2 text-3xl font-black text-slate-950">{String(count.count_number || countId)}</h1>
          <p className="text-sm font-semibold text-slate-500">{String(count.count_type)} · {status} · variance {formatMoney(Number(count.variance_value_total || totals.varianceValue || 0))}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && canCreateCount ? <button type="button" disabled={saving} onClick={() => void saveLines()} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-[#F8FAFC] disabled:opacity-60"><Save size={14} />{saving ? "Saving…" : "Save Count Lines"}</button> : null}
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2 text-xs font-black text-violet-800"><Printer size={14} />Print</button>
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2 text-xs font-black text-violet-800"><Download size={14} />Export CSV</button>
        </div>
      </div>

      {message ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-800 print:hidden">{message}</p> : null}

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-[10px] font-black uppercase text-violet-600">System Qty</div><div className="mt-1 text-2xl font-black text-slate-950">{totals.system.toFixed(2)}</div></div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-[10px] font-black uppercase text-violet-600">Counted Qty</div><div className="mt-1 text-2xl font-black text-slate-950">{totals.counted.toFixed(2)}</div></div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-[10px] font-black uppercase text-violet-600">Variance Qty</div><div className={totals.varianceQty !== 0 ? "mt-1 text-2xl font-black text-red-600" : "mt-1 text-2xl font-black text-slate-950"}>{totals.varianceQty.toFixed(2)}</div></div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-[10px] font-black uppercase text-violet-600">Variance Value</div><div className="mt-1 text-2xl font-black text-slate-950">{formatMoney(totals.varianceValue)}</div></div>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        {editable && canCreateCount ? <button type="button" onClick={() => void action("start")} className="rounded-xl bg-slate-200 px-3 py-2 text-xs font-black">Start Count</button> : null}
        {editable && canCreateCount ? <button type="button" onClick={() => void action("submit")} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white">Submit</button> : null}
        {status === "Submitted" && canApproveCount ? <button type="button" onClick={() => void action("approve", { approvedBy: "supervisor" })} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white">Approve Variances</button> : null}
        {status === "Approved" && canPostAdjustment ? <button type="button" onClick={() => void action("post", { actor: "supervisor" })} className="rounded-xl bg-fuchsia-600 px-3 py-2 text-xs font-black text-white">Post to Ledger</button> : null}
      </div>

      <div className="rounded-[2rem] border border-violet-100 bg-white p-4 print:hidden">
        <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
          <Search size={18} className="text-violet-700" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item or variance class…" className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400" />
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700">{filtered.length}</span>
        </div>
      </div>

        <div className="overflow-x-auto rounded-[2rem] border border-violet-100 bg-white shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="bg-violet-800 text-xs font-black uppercase tracking-[0.14em] text-violet-100">
            <tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">System</th><th className="px-4 py-3">Counted</th><th className="px-4 py-3">Variance</th><th className="px-4 py-3">%</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Unit</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center font-bold text-slate-500">No count lines found. If this count is empty, create stock items first from Stock Master.</td></tr> : null}
            {filtered.map((line) => {
              const counted = num(line.draft_counted_qty ?? line.counted_qty);
              const system = num(line.system_qty);
              const varianceQty = counted - system;
              const variancePct = system > 0 ? (varianceQty / system) * 100 : counted > 0 ? 100 : 0;
              const varianceValue = Math.abs(varianceQty * num(line.unit_cost));
              const varianceClass = String(line.variance_class || (Math.abs(variancePct) >= 10 ? "major" : "minor"));
              return (
                <tr key={String(line.id)} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-bold text-slate-900">{stockName(line)}</td>
                  <td className="px-4 py-3">{system.toFixed(2)}</td>
                  <td className="px-4 py-3">{editable ? <input type="number" className="w-28 rounded-xl border px-3 py-2 font-bold" value={counted} onChange={(e) => updateDraftLine(String(line.id), num(e.target.value))} /> : counted.toFixed(2)}</td>
                  <td className={varianceQty !== 0 ? "px-4 py-3 font-black text-red-600" : "px-4 py-3 font-bold text-slate-700"}>{varianceQty.toFixed(2)}</td>
                  <td className="px-4 py-3">{variancePct.toFixed(1)}%</td>
                  <td className="px-4 py-3 font-black">{formatMoney(varianceValue)}</td>
                  <td className="px-4 py-3"><span className={varianceClass === "major" ? "rounded-full bg-red-100 px-3 py-1 text-[10px] font-black uppercase text-red-800" : "rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase text-amber-800"}>{varianceClass}</span></td>
                  <td className="px-4 py-3">{stockUnit(line)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
