"use client";

import { RefreshCcw } from "lucide-react";
import { useState } from "react";
import { recalculateBomsUsingIngredient } from "@/lib/vyron-cost-ingredient-intelligence";

export default function IngredientImpactClient({ ingredientId }: { ingredientId: string }) {
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function recalculate() {
    setMessage("");
    setErrorMessage("");
    setWorking(true);

    try {
      const result = await recalculateBomsUsingIngredient(ingredientId);
      setMessage(
        `Recalculation complete. ${result.bomCount} BOM${result.bomCount === 1 ? "" : "s"} and ${result.productCount} product${result.productCount === 1 ? "" : "s"} updated.`
      );
    } catch (error: any) {
      setErrorMessage(error?.message || "Could not recalculate affected BOMs and products.");
    } finally {
      setWorking(false);
    }
  }

  return (
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
        <div className="mt-4 rounded-2xl bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="mt-4 rounded-2xl bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
