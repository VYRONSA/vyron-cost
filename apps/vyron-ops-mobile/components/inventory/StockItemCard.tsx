import { Pressable, Text, View } from "react-native";
import { VyronCard } from "@/components/ui/Card";
import type { StockItem } from "@/types/inventory";

type StockItemCardProps = {
  item: StockItem;
  subtitle?: string;
  onPress?: () => void;
};

export function StockItemCard({ item, subtitle, onPress }: StockItemCardProps) {
  const content = (
    <VyronCard className="gap-2">
      <Text className="text-xl font-bold text-vyron-text">{item.description}</Text>
      <Text className="text-sm font-semibold text-vyron-muted">SKU {item.item_code || "—"}</Text>
      <View className="flex-row flex-wrap gap-3">
        <Text className="text-sm font-semibold text-vyron-emerald">
          {item.qty_on_hand} {item.unit}
        </Text>
        <Text className="text-sm font-semibold text-vyron-subtle">{item.entity_type}</Text>
      </View>
      {subtitle ? <Text className="text-sm font-medium text-vyron-muted">{subtitle}</Text> : null}
    </VyronCard>
  );

  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  );
}

type InventoryTileProps = {
  title: string;
  subtitle: string;
  onPress: () => void;
};

export function InventoryTile({ title, subtitle, onPress }: InventoryTileProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="min-w-[46%] flex-1">
      <VyronCard className="min-h-[148px] justify-between gap-3">
        <Text className="text-lg font-bold text-vyron-text">{title}</Text>
        <Text className="text-sm font-medium text-vyron-muted">{subtitle}</Text>
      </VyronCard>
    </Pressable>
  );
}
