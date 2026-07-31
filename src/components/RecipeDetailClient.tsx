"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import {
  BomHeader,
  BomLine,
  calcGp,
  calcLineCost,
  calcSuggestedPrice,
  demoBomLines,
  demoBoms,
  formatMoney,
} from "@/lib/vyron-cost-bom-data";
import { recipeLineToBomLine, recipeToBomHeader } from "@/lib/vyron-cost-recipes-data";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

type ProductLink = { id: string; product_name: string };

export default function RecipeDetailClient({
  recipeId,
  initialBom,
  initialLines,
}: {
  recipeId: string;
  initialBom?: BomHeader | null;
  initialLines?: BomLine[];
}) {
  const { canEdit } = useModulePermissions("boms");
  const [demoMode, setDemoMode] = useState(false);
  const [bom, setBom] = useState<BomHeader | null>(initialBom ?? null);
  const [lines, setLines] = useState<BomLine[]>(initialLines ?? []);
  const [linkedProduct, setLinkedProduct] = useState<ProductLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const client = readActiveClient();
    const demo = isDemoWorkspace(client);
    setDemoMode(demo);

    if (demo) {
      const match = demoBoms.find((item) => item.id === recipeId) || null;
      setBom(match);
      setLines(match ? demoBomLines.filter((line) => line.bom_id === match.id) : []);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    fetch(`/api/recipes/${recipeId}`)
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.ok || !data.recipe) {
          setBom(null);
          setLines([]);
          setError(data.error || "BOM not found.");
          return;
        }
        const header = recipeToBomHeader(data.recipe);
        setBom(header);
        setLines((data.recipe.lines || []).map(recipeLineToBomLine));

        if (header.product_id) {
          const prodRes = await fetch("/api/products").then((r) => r.json());
          if (prodRes.ok && Array.isArray(prodRes.products)) {
            const match = prodRes.products.find((p: { id: string }) => p.id === header.product_id);
            if (match) {
              setLinkedProduct({ id: String(match.id), product_name: String(match.product_name || "") });
            }
          }
        } else {
          setLinkedProduct(null);
        }
      })
      .catch(() => {
        setBom(null);
        setLines([]);
        setError("Could not load BOM.");
      })
      .finally(() => setLoading(false));
  }, [recipeId]);

  const totals = useMemo(() => {
    if (!bom) return null;
    const calculatedTotalCost = lines.reduce(
      (sum, line) => sum + Number(line.line_cost ?? calcLineCost(line)),
      0
    );
    const totalCost = calculatedTotalCost > 0 ? calculatedTotalCost : Number(bom.total_cost || 0);
    const yieldQty = Math.max(1, Number(bom.yield_qty || 1));
    const costPerUnit =
      Number(bom.cost_per_unit || 0) > 0
        ? Number(bom.cost_per_unit)
        : yieldQty > 0
          ? totalCost / yieldQty
          : totalCost;
    const sellingPrice = Number(bom.selling_price || 0);
    const targetGp = Number(bom.target_gp || 0);
    return {
      totalCost,
      costPerUnit,
      sellingPrice,
      actualGp: Number(bom.calculated_gp ?? calcGp(sellingPrice, costPerUnit)),
      suggestedBatchPrice: Number(
        bom.suggested_selling_price ?? calcSuggestedPrice(costPerUnit, targetGp)
      ),
      targetGp,
    };
  }, [bom, lines]);

  if (loading) {
    return <p className="text-sm font-bold text-slate-500">Loading BOM…</p>;
  }

  if (!bom || error) {
    return (
      <div className="rounded-[2rem] bg-white p-8 font-bold text-slate-600">
        {error || "BOM not found."}
        <div className="mt-4">
          <Link href="/recipes" className="text-sm font-black text-violet-700">
            ← Back to Recipes
          </Link>
        </div>
      </div>
    );
  }

  if (!totals) return null;

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        title: "Recipe Detail",
        subtitle: "Premium VYRON COST workflow for recipe detail.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/recipes" className="text-xs font-black text-violet-700">
                ← Recipes & BOM
              </Link>
              {canEdit ? (
                <Link href={`/recipes/${bom.id}/edit`} className="rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white">
                  Edit BOM
                </Link>
              ) : null}
            </div>
      
            {linkedProduct ? (
              <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-4 text-sm font-bold text-[#4D7C0F]">
                Linked finished product:{" "}
                <Link href={`/products/${linkedProduct.id}/edit`} className="font-black text-[#7E22CE] underline">
                  {linkedProduct.product_name}
                </Link>
                {" · "}Product cost syncs when this BOM is saved.
              </div>
            ) : null}
      
            <div className="grid gap-5 md:grid-cols-5">
              {[
                ["Total Cost", formatMoney(totals.totalCost), "text-slate-900"],
                ["Cost / Unit", formatMoney(totals.costPerUnit), "text-violet-700"],
                ["Selling Price (Batch)", formatMoney(totals.sellingPrice), "text-slate-900"],
                ["Actual GP", `${totals.actualGp.toFixed(1)}%`, totals.actualGp < totals.targetGp ? "text-red-600" : "text-[#84CC16]"],
                ["Suggested Batch Price", formatMoney(totals.suggestedBatchPrice), "text-[#84CC16]"],
              ].map(([label, value, cls]) => (
                <div key={label} className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
                  <div className={`mt-3 text-3xl font-black ${cls}`}>{value}</div>
                </div>
              ))}
            </div>
      
            <section className="rounded-[2rem] border border-violet-100 bg-violet-50 p-5 text-sm font-black text-violet-900">
              Formula used: Actual GP = (Selling Price - Cost / Unit) / Selling Price. Suggested Price = Cost / Unit / (1 - Target GP%).
            </section>
      
            <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <h2 className="mb-5 text-xl font-black text-slate-900">BOM Lines</h2>
              {lines.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">No cost lines on this BOM yet.</p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  <div className="grid grid-cols-7 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    <div>Type</div>
                    <div>Name</div>
                    <div>Qty</div>
                    <div>Unit</div>
                    <div>Unit Cost</div>
                    <div>Waste</div>
                    <div>Line Cost</div>
                  </div>
                  {lines.map((line) => (
                    <div key={line.id} className="grid grid-cols-7 border-t border-slate-100 px-5 py-4 text-sm">
                      <div className="font-bold text-slate-500">{line.line_type}</div>
                      <div className="font-black text-slate-900">{line.line_name}</div>
                      <div className="font-bold text-slate-500">{Number(line.quantity || 0).toFixed(4)}</div>
                      <div className="font-bold text-slate-500">{line.unit}</div>
                      <div className="font-black text-violet-700">{formatMoney(line.unit_cost)}</div>
                      <div className="font-bold text-slate-500">{Number(line.wastage_percent || 0).toFixed(1)}%</div>
                      <div className="font-black text-slate-900">{formatMoney(line.line_cost ?? calcLineCost(line))}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
      
            {demoMode ? (
              <p className="text-xs font-bold text-fuchsia-700">Demo workspace — sample BOM data only.</p>
            ) : null}
          </section>
    </VyronPremiumPageShell>
  );
}
