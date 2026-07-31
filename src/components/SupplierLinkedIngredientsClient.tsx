"use client";

import { Link2, Save } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

type IngredientOption = {
  id: string;
  ingredient_name: string;
  category?: string | null;
  supplier_id?: string | null;
};

export default function SupplierLinkedIngredientsClient({
  supplierId,
  ingredients,
}: {
  supplierId: string;
  ingredients: IngredientOption[];
}) {
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const unlinked = ingredients.filter((item) => item.supplier_id !== supplierId);

  async function linkIngredient() {
    setMessage("");
    setErrorMessage("");

    if (!selected) {
      setErrorMessage("Choose an ingredient first.");
      return;
    }

    if (!supabase) {
      setErrorMessage("Supabase is not configured.");
      return;
    }

    const { error } = await supabase
      .from("vyron_cost_ingredients")
      .update({ supplier_id: supplierId })
      .eq("id", selected);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage("Ingredient linked to supplier. Refresh the page to update intelligence.");
    setSelected("");
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "suppliers",
        title: "Supplier Linked Ingredients",
        subtitle: "Premium VYRON COST workflow for supplier linked ingredients.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div className="mt-5 rounded-3xl bg-violet-50 p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white">
                <Link2 size={20} />
              </div>
              <div>
                <div className="font-black text-violet-950">Link ingredients to this supplier</div>
                <p className="mt-1 text-sm font-bold leading-6 text-violet-900">
                  Supplier Intelligence only becomes powerful when ingredients are linked to suppliers.
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_180px]">
              <select
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                className="rounded-2xl border border-violet-200 bg-white px-4 py-4 text-sm font-bold outline-none"
              >
                <option value="">Choose ingredient...</option>
                {unlinked.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.ingredient_name} {item.category ? `— ${item.category}` : ""}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={linkIngredient}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-700 px-5 py-4 text-sm font-black text-white"
              >
                <Save size={17} />
                Link
              </button>
            </div>

            {message && (
              <div className="mt-4 rounded-2xl border border-[#A855F7]/25 bg-[#A855F7]/12 px-4 py-3 text-sm font-bold text-[#7E22CE]">
                {message}
              </div>
            )}

            {errorMessage && (
              <div className="mt-4 rounded-2xl bg-red-100 px-4 py-3 text-sm font-bold text-red-700">
                {errorMessage}
              </div>
            )}
          </div>
    </VyronPremiumPageShell>
  );
}
