"use client";

import { RefreshCcw } from "lucide-react";
import { useState } from "react";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function IngredientImpactClient({ ingredientId }: { ingredientId: string }) {
  const { canEdit } = useModulePermissions("ingredients");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function recalculate() {
    if (!canEdit) {
      setErrorMessage("You do not have permission to recalculate BOM costs.");
      return;
    }
    setMessage("");
    setErrorMessage("");
    setWorking(true);

    try {
      const response = await fetch(`/api/ingredients/${ingredientId}/recalculate-boms`, {
        method: "POST",
      });
      const result = await response.json();
      if (!result.ok) {
        setErrorMessage(result.error || "Could not recalculate affected BOMs and products.");
        return;
      }
      setMessage(
        `Recalculation complete. ${result.bomCount} BOM${result.bomCount === 1 ? "" : "s"} and ${result.productCount} product${result.productCount === 1 ? "" : "s"} updated.`
      );
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Could not recalculate affected BOMs and products.");
    } finally {
      setWorking(false);
    }
  }

  if (!canEdit) return null;

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "ingredients",
        title: "Ingredient Impact",
        subtitle: "Premium VYRON COST workflow for ingredient impact.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div className="mt-5">
            <button
              type="button"
              onClick={recalculate}
              disabled={working}
              className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-sm font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-violet-500/25 disabled:opacity-60"
            >
              <RefreshCcw size={18} />
              {working ? "Recalculating..." : "Recalculate Affected BOMs"}
            </button>

            {message && (
              <div className="mt-4 rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 px-5 py-4 text-sm font-bold text-[#65A30D]">
                {message}
              </div>
            )}

            {errorMessage && (
              <div className="mt-4 rounded-2xl bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
                {errorMessage}
              </div>
            )}
          </div>
    </VyronPremiumPageShell>
  );
}
