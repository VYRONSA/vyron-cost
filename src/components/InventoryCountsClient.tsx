"use client";

import Link from "next/link";
import { RefreshCcw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";

type CountType = "ingredients" | "packaging" | "finished_goods";

type CountRow = Record<string, unknown>;

function labelForType(type: CountType) {
  if (type === "ingredients") return "Ingredients";
  if (type === "packaging") return "Packaging";
  return "Finished Goods";
}

export default function InventoryCountsClient() {
  const router = useRouter();
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [creating, setCreating] = useState<CountType | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  async function loadCounts() {
    setMessage("");
    try {
      const res = await fetch("/api/inventory/counts");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not load stock counts.");
      setCounts(data.counts || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load stock counts.");
    }
  }

  useEffect(() => {
    void loadCounts();
  }, []);

  async function newCount(countType: CountType) {
    setCreating(countType);
    setMessage(`Creating ${labelForType(countType)} count…`);
    try {
      const res = await fetch("/api/inventory/counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countType, createdBy: "supervisor" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not create stock count.");
      if (Number(data.lineCount || 0) <= 0) {
        setMessage("Stock count was created but no stock master items were found for this type. Open Stock Master and confirm stock items exist.");
      }
      if (data.count?.id) router.push(`/inventory/counts/${data.count.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create stock count.");
    } finally {
      setCreating(null);
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return counts;
    return counts.filter((count) => [count.count_number, count.count_type, count.status, count.created_by].join(" ").toLowerCase().includes(term));
  }, [counts, search]);

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-950">Stock Counts</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Draft → count → submit → approve → post variance to the stock ledger.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["ingredients", "packaging", "finished_goods"] as const).map((type) => (
              <button
                key={type}
                type="button"
                disabled={creating !== null}
                onClick={() => void newCount(type)}
                className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2 text-xs font-black text-white disabled:opacity-60"
              >
                {creating === type ? "Creating…" : `New ${labelForType(type)} Count`}
              </button>
            ))}
            <button type="button" onClick={() => void loadCounts()} className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2 text-xs font-black text-violet-800">
              <RefreshCcw size={14} /> Refresh
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
          <Search size={18} className="text-violet-700" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search stock counts…"
            className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
          />
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700">{filtered.length}</span>
        </div>
      </div>

      {message ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">{message}</p> : null}

      <div className="overflow-hidden rounded-[2rem] border border-violet-100 bg-white shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm font-bold text-slate-500">No stock counts found. Create one from the buttons above.</div>
        ) : null}
        {filtered.map((count) => {
          const id = String(count.id);
          const status = String(count.status || "Draft");
          return (
            <Link key={id} href={`/inventory/counts/${id}`} className="grid gap-2 border-t border-slate-100 p-5 hover:bg-violet-50 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:items-center">
              <div>
                <div className="text-lg font-black text-slate-950">{String(count.count_number || id)}</div>
                <div className="text-xs font-bold text-slate-500">Created {String(count.created_at || "").slice(0, 16) || "—"}</div>
              </div>
              <div className="text-sm font-bold text-slate-700">{String(count.count_type || "stock")}</div>
              <div>
                <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">{status}</span>
              </div>
              <div className={Number(count.variance_value_total || 0) !== 0 ? "text-sm font-black text-red-600" : "text-sm font-black text-slate-700"}>
                {formatMoney(Number(count.variance_value_total || 0))}
              </div>
              <div className="text-xs font-black text-violet-700">Open →</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
