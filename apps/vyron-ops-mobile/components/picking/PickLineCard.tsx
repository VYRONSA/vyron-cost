import { Pressable, Text, View } from "react-native";
import { VyronButton } from "@/components/ui/Button";
import { VyronCard } from "@/components/ui/Card";
import type { PickLineDraft, ShortPickReason } from "@/types/store-orders";

const SHORT_PICK_REASONS: ShortPickReason[] = ["Out of Stock", "Damaged", "Substituted", "Other"];

type PickLineCardProps = {
  line: PickLineDraft;
  error?: string;
  onIncrement: (amount: number) => void;
  onPickFull: () => void;
  onShortPick: (reason: ShortPickReason) => void;
  onSkip: () => void;
};

export function PickLineCard({
  line,
  error,
  onIncrement,
  onPickFull,
  onShortPick,
  onSkip,
}: PickLineCardProps) {
  const outstanding = Math.max(line.requiredQty - line.pickedQty, 0);

  return (
    <VyronCard className={`gap-4 ${line.skipped ? "opacity-60" : ""}`}>
      <View className="gap-1">
        <Text className="text-xl font-bold text-vyron-text">{line.productName}</Text>
        <Text className="text-sm font-semibold text-vyron-muted">
          Required {line.requiredQty} {line.unit} · Picked {line.pickedQty} · Outstanding {outstanding}
        </Text>
        {line.shortPickReason ? (
          <Text className="text-sm font-semibold text-vyron-amber">
            Short pick: {line.shortPickReason}
            {line.shortPickNote ? ` — ${line.shortPickNote}` : ""}
          </Text>
        ) : null}
      </View>

      {error ? <Text className="text-sm font-semibold text-vyron-rose">{error}</Text> : null}

      <View className="flex-row flex-wrap gap-3">
        <VyronButton label="+1" className="min-w-[72px] flex-1" onPress={() => onIncrement(1)} />
        <VyronButton label="+5" variant="secondary" className="min-w-[72px] flex-1" onPress={() => onIncrement(5)} />
        <VyronButton label="Pick full" variant="secondary" className="min-w-[120px] flex-1" onPress={onPickFull} />
        <VyronButton label="Skip" variant="ghost" className="min-w-[100px] flex-1" onPress={onSkip} />
      </View>

      <View className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-widest text-vyron-subtle">Short pick reason</Text>
        <View className="flex-row flex-wrap gap-2">
          {SHORT_PICK_REASONS.map((reason) => (
            <Pressable
              key={reason}
              accessibilityRole="button"
              className="min-h-[48px] items-center justify-center rounded-vyron border border-vyron-border bg-vyron-surface px-3"
              onPress={() => onShortPick(reason)}
            >
              <Text className="text-xs font-bold text-vyron-text">{reason}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </VyronCard>
  );
}
