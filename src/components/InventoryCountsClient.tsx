"use client";

import Link from "next/link";
import { RefreshCcw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";
import { useInventoryPermissions } from "@/hooks/useModulePermissions";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import {
  VyronPremiumEmptyState,
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

type CountType = "ingredients" | "packaging" | "finished_goods";

type CountRow = Record<string, unknown>;

function labelForType(type: CountType) {
  if (type === "ingredients") return "Ingredients";
  if (type === "packaging") return "Packaging";
  return "Finished Goods";
}

export default function InventoryCountsClient() {
  const { canCreateCount } = useInventoryPermissions();
  const router = useRouter();
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [creating, setCreating] = useState<CountType | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  async function loadCounts() {
    setMessage("");
    try {
      const { query } = poApiWorkspaceContext();
      const res = await fetch(`/api/inventory/counts${query}`, { cache: "no-store" });
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
    if (!canCreateCount) {
      setMessage("You do not have permission to create stock counts.");
      return;
    }
    setCreating(countType);
    setMessage(`Creating ${labelForType(countType)} count…`);
    try {
      const { body: workspaceBody } = poApiWorkspaceContext();
      const res = await fetch("/api/inventory/counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...workspaceBody, countType }),
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
    <section className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="inventory"
        badge="Premium Inventory Workspace"
        title="Stock Count Command Centre"
        subtitle="Draft → count → submit → approve → post variance to the stock ledger — the disciplined path to inventory truth."
        outcomes={[
          "Create counts by stock type",
          "Capture physical quantities per item",
          "Approve variances before posting",
          "Post adjustments to the permanent ledger",
        ]}
        quotes={[
          { label: "Inventory", quote: "Inventory is cash wearing a disguise." },
          { label: "Truth", quote: "What gets measured gets protected." },
        ]}
      >
        {canCreateCount
          ? (["ingredients", "packaging", "finished_goods"] as const).map((type) => (
              <button
                key={type}
                type="button"
                disabled={creating !== null}
                onClick={() => void newCount(type)}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-violet-900 shadow-lg disabled:opacity-60"
              >
                {creating === type ? "Creating…" : `New ${labelForType(type)} Count`}
              </button>
            ))
          : null}
        <button
          type="button"
          onClick={() => void loadCounts()}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white backdrop-blur-sm"
        >
          <RefreshCcw size={16} /> Refresh
        </button>
      </VyronPremiumHeroBanner>

      <VyronPremiumFormulaCard
        variant="light"
        eyebrow="Variance"
        title="Stock count formulas"
        formulas={[
          { label: "Count Variance", formula: "Physical qty − System qty" },
          { label: "Value Variance", formula: "Variance qty × weighted average unit cost" },
          { label: "Inventory Value", formula: "On-hand qty × weighted average cost" },
        ]}
        className="max-w-2xl"
      />

      <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <VyronPremiumSectionHeading eyebrow="Search" title="Stock count register" subtitle="Filter by count number, type, status or creator." />

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

      {message ? <p className="rounded-2xl bg-fuchsia-50 px-4 py-3 text-sm font-black text-fuchsia-800">{message}</p> : null}

      <div className="overflow-hidden rounded-[2rem] border border-violet-100 bg-white shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        {filtered.length === 0 ? (
          <div className="p-6">
            <VyronPremiumEmptyState
              steps={[
                "Confirm stock master items exist for the count type.",
                "Create a new ingredients, packaging or finished goods count.",
                "Enter physical quantities and submit for approval.",
                "Post approved variances to update the ledger.",
              ]}
            />
          </div>
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
