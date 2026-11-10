"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MinimumLevelsUpload from "@/components/vyron-cost/inventory/MinimumLevelsUpload";
import { Card, KpiCard, Notice, Pill, PrimaryButton, SecondaryButton, qty } from "@/components/vyron-order-engine/ui";

type Level = {
  id: string;
  stock_item_id: string;
  item_code: string | null;
  description: string | null;
  entity_type: string | null;
  unit: string | null;
  qty_on_hand: number;
  minimum_qty: number;
  warning_qty: number | null;
  critical_qty: number | null;
  block_production: boolean;
  status: "OK" | "WARNING" | "BELOW_MINIMUM" | "CRITICAL";
  shortfall: number;
  updated_by: string;
  updated_at: string;
};
type Item = { id: string; item_code: string | null; description: string | null; entity_type: string | null; unit: string | null; qty_on_hand: number };

const STATUS: Record<Level["status"], { label: string; tone: "green" | "amber" | "rose" }> = {
  OK: { label: "OK", tone: "green" },
  WARNING: { label: "Warning", tone: "amber" },
  BELOW_MINIMUM: { label: "Below minimum", tone: "rose" },
  CRITICAL: { label: "Critical", tone: "rose" },
};
const inputClass = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold";
type Section = "finished_goods" | "raw_materials";
const SECTION_LABEL: Record<Section, string> = { finished_goods: "Finished Goods", raw_materials: "Raw Materials" };
const sectionOf = (entityType: string | null): Section => (entityType === "finished_goods" ? "finished_goods" : "raw_materials");
const empty = { stockItemId: "", minimumQty: "", warningQty: "", criticalQty: "", blockProduction: false };

async function fetchMinimumLevels(): Promise<{ ok: false; error: string } | { ok: true; levels: Level[]; items: Item[]; cadence: string | undefined }> {
  const data = await fetch("/api/inventory/minimum-levels", { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => ({ ok: false }));
  if (!data.ok) return { ok: false, error: data.error || "Could not load minimum levels." };
  const c = await fetch("/api/inventory/production-cadence", { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => null);
  return { ok: true, levels: data.levels, items: data.items, cadence: c?.ok ? (c.expectedProductionIntervalHours === null ? "" : String(c.expectedProductionIntervalHours)) : undefined };
}

export default function MinimumLevelsClient() {
  const [levels, setLevels] = useState<Level[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState(empty);
  const [filter, setFilter] = useState<"ALL" | Level["status"]>("ALL");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cadence, setCadence] = useState("");
  const [section, setSection] = useState<Section>("finished_goods");

  const applyLoaded = useCallback((loaded: Awaited<ReturnType<typeof fetchMinimumLevels>>) => {
    if (!loaded.ok) {
      setMessage({ tone: "error", text: loaded.error });
      setLevels([]);
      return;
    }
    setLevels(loaded.levels);
    setItems(loaded.items);
    if (loaded.cadence !== undefined) setCadence(loaded.cadence);
  }, []);
  const load = useCallback(() => fetchMinimumLevels().then(applyLoaded), [applyLoaded]);

  const saveCadence = async () => {
    setMessage(null);
    const res = await fetch("/api/inventory/production-cadence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedProductionIntervalHours: cadence.trim() === "" ? null : Number(cadence) }),
    });
    const data = await res.json();
    setMessage(data.ok ? { tone: "success", text: data.expectedProductionIntervalHours === null ? "Production cadence warning switched off." : "Production cadence saved." } : { tone: "error", text: data.error || "Save failed." });
  };
  useEffect(() => {
    let cancelled = false;
    void fetchMinimumLevels().then((loaded) => {
      if (!cancelled) applyLoaded(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [applyLoaded]);

  const counts = useMemo(() => {
    const c = { OK: 0, WARNING: 0, BELOW_MINIMUM: 0, CRITICAL: 0 };
    for (const l of levels || []) if (sectionOf(l.entity_type) === section) c[l.status]++;
    return c;
  }, [levels, section]);
  const sectionLevels = (levels || []).filter((l) => sectionOf(l.entity_type) === section);
  const sectionItems = items.filter((i) => sectionOf(i.entity_type) === section);
  const shown = sectionLevels.filter((l) => filter === "ALL" || l.status === filter);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/inventory/minimum-levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockItemId: form.stockItemId,
          minimumQty: Number(form.minimumQty),
          warningQty: form.warningQty === "" ? null : Number(form.warningQty),
          criticalQty: form.criticalQty === "" ? null : Number(form.criticalQty),
          blockProduction: form.blockProduction,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Save failed.");
      setMessage({ tone: "success", text: "Minimum level saved." });
      setForm(empty);
      await load();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (level: Level) => {
    if (!window.confirm(`Remove the minimum level for ${level.description || level.item_code}?`)) return;
    const res = await fetch(`/api/inventory/minimum-levels?id=${encodeURIComponent(level.id)}`, { method: "DELETE" });
    const data = await res.json();
    setMessage(data.ok ? { tone: "success", text: "Minimum level removed." } : { tone: "error", text: data.error || "Remove failed." });
    await load();
  };

  const edit = (level: Level) =>
    setForm({
      stockItemId: level.stock_item_id,
      minimumQty: String(level.minimum_qty),
      warningQty: level.warning_qty === null ? "" : String(level.warning_qty),
      criticalQty: level.critical_qty === null ? "" : String(level.critical_qty),
      blockProduction: level.block_production,
    });

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Minimum Stock Levels</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
          Your company&apos;s own minimum, warning and critical levels per stock item. Production warns when a run would take an item below its minimum, and blocks only items you mark
          &quot;Block production&quot;. Items with no minimum are never reported.
        </p>
      </div>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="flex flex-wrap gap-2" role="tablist" data-testid="min-sections">
        {(Object.keys(SECTION_LABEL) as Section[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={section === s}
            onClick={() => {
              setSection(s);
              setFilter("ALL");
              setForm(empty);
            }}
            className={`rounded-2xl px-5 py-2.5 text-sm font-black ${section === s ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
          >
            {SECTION_LABEL[s]} ({(levels || []).filter((l) => sectionOf(l.entity_type) === s).length})
          </button>
        ))}
      </div>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label={`${SECTION_LABEL[section]} configured`} value={String(sectionLevels.length)} active={filter === "ALL"} onClick={() => setFilter("ALL")} />
        <KpiCard label="OK" value={String(counts.OK)} active={filter === "OK"} onClick={() => setFilter("OK")} />
        <KpiCard label="Warning" value={String(counts.WARNING)} active={filter === "WARNING"} onClick={() => setFilter("WARNING")} />
        <KpiCard label="Below minimum" value={String(counts.BELOW_MINIMUM)} active={filter === "BELOW_MINIMUM"} onClick={() => setFilter("BELOW_MINIMUM")} />
        <KpiCard label="Critical" value={String(counts.CRITICAL)} active={filter === "CRITICAL"} onClick={() => setFilter("CRITICAL")} />
      </section>

      <Card title={`Set a ${SECTION_LABEL[section]} minimum level`}>
        <div className="grid gap-3 md:grid-cols-6">
          <label className="grid gap-1 text-xs font-black uppercase text-slate-500 md:col-span-2">
            Stock item
            <select className={inputClass} value={form.stockItemId} onChange={(e) => setForm({ ...form, stockItemId: e.target.value })}>
              <option value="">Choose…</option>
              {sectionItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.description || i.item_code} {i.item_code ? `(${i.item_code})` : ""} — on hand {qty(i.qty_on_hand)} {i.unit || ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
            Minimum
            <input className={inputClass} type="number" min="0" step="any" value={form.minimumQty} onChange={(e) => setForm({ ...form, minimumQty: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
            Warning (optional)
            <input className={inputClass} type="number" min="0" step="any" value={form.warningQty} onChange={(e) => setForm({ ...form, warningQty: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
            Critical (optional)
            <input className={inputClass} type="number" min="0" step="any" value={form.criticalQty} onChange={(e) => setForm({ ...form, criticalQty: e.target.value })} />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm font-black text-slate-700">
            <input type="checkbox" checked={form.blockProduction} onChange={(e) => setForm({ ...form, blockProduction: e.target.checked })} />
            Block production
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <PrimaryButton disabled={busy || !form.stockItemId || form.minimumQty === ""} onClick={() => void save()}>
            Save minimum level
          </PrimaryButton>
          {form.stockItemId ? <SecondaryButton onClick={() => setForm(empty)}>Clear</SecondaryButton> : null}
        </div>
      </Card>

      <MinimumLevelsUpload key={section} kind={section} onApplied={() => void load()} />

      <Card title="Production cadence warning">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
            Warn when no production is processed for (hours)
            <input className={inputClass} type="number" min="1" step="any" value={cadence} onChange={(e) => setCadence(e.target.value)} placeholder="Blank = no warning" />
          </label>
          <SecondaryButton onClick={() => void saveCadence()}>Save</SecondaryButton>
          <span className="text-xs font-semibold text-slate-500">Shown on the dashboard. Leave blank if your company does not produce on a fixed schedule.</span>
        </div>
      </Card>

      <Card title={`${SECTION_LABEL[section]} minimum levels`}>
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3 text-right">On hand</th>
                <th className="py-2 pr-3 text-right">Minimum</th>
                <th className="py-2 pr-3 text-right">Warning</th>
                <th className="py-2 pr-3 text-right">Critical</th>
                <th className="py-2 pr-3 text-right">Shortfall</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Production</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 font-semibold text-slate-700">
                  <td className="py-2 pr-3 font-black text-slate-900">
                    {l.description || l.item_code}
                    <span className="block text-xs font-semibold text-slate-400">{l.item_code}</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {qty(l.qty_on_hand)} {l.unit || ""}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{qty(l.minimum_qty)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{qty(l.warning_qty)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{qty(l.critical_qty)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.shortfall ? qty(l.shortfall) : "—"}</td>
                  <td className="py-2 pr-3">
                    <Pill tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Pill>
                  </td>
                  <td className="py-2 pr-3">{l.block_production ? <Pill tone="rose">Blocks</Pill> : <Pill>Warns</Pill>}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <SecondaryButton onClick={() => edit(l)}>Edit</SecondaryButton> <SecondaryButton tone="rose" onClick={() => void remove(l)}>Remove</SecondaryButton>
                  </td>
                </tr>
              ))}
              {levels && !shown.length ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sm font-semibold text-slate-400">
                    {sectionLevels.length ? "Nothing in this status." : `No ${SECTION_LABEL[section].toLowerCase()} minimum levels set yet.`}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
