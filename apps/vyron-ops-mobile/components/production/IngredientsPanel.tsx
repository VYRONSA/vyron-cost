import { Text, View } from "react-native";
import { VyronBadge, VyronCard } from "@/components/ui";
import type { ProductionRunLine, StockShortage } from "@/types/production";

type IngredientsPanelProps = {
  lines: ProductionRunLine[];
  shortages: StockShortage[];
};

export function IngredientsPanel({ lines, shortages }: IngredientsPanelProps) {
  const ingredients = lines.filter((line) => line.line_type === "Ingredient");

  return (
    <View className="gap-3">
      <Text className="text-lg font-bold text-vyron-text">Required ingredients</Text>
      {ingredients.length === 0 ? (
        <Text className="text-sm font-medium text-vyron-muted">No ingredient lines on this run.</Text>
      ) : (
        ingredients.map((line) => (
          <VyronCard key={line.id} className="gap-2">
            <Text className="text-lg font-bold text-vyron-text">{line.line_name}</Text>
            <Text className="text-sm font-semibold text-vyron-muted">
              Required {line.planned_qty} {line.unit}
            </Text>
          </VyronCard>
        ))
      )}

      <Text className="text-lg font-bold text-vyron-amber">Shortages</Text>
      {shortages.length === 0 ? (
        <Text className="text-sm font-medium text-vyron-muted">No raw material shortages detected.</Text>
      ) : (
        shortages.map((shortage) => (
          <VyronCard key={`${shortage.ingredient}-${shortage.unit}`} className="gap-2 border-rose-500/30">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-vyron-text">{shortage.ingredient}</Text>
              <VyronBadge label="Short" tone="danger" />
            </View>
            <Text className="text-sm font-semibold text-vyron-rose">
              Need {shortage.required} {shortage.unit} · Available {shortage.available} · Short{" "}
              {shortage.shortfall}
            </Text>
          </VyronCard>
        ))
      )}
    </View>
  );
}
