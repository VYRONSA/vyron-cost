import { Pressable, Text, View } from "react-native";
import { VyronButton } from "@/components/ui/Button";
import { VyronCard } from "@/components/ui/Card";
import { VyronInput } from "@/components/ui/Input";
import type { ReceiveLineDraft } from "@/types/receiving";

type ReceiveLineCardProps = {
  line: ReceiveLineDraft;
  error?: string;
  onChangeQty: (qty: number) => void;
  onReceiveFull: () => void;
  onReceivePartial: () => void;
  onSkip: () => void;
  onScan?: () => void;
};

export function ReceiveLineCard({
  line,
  error,
  onChangeQty,
  onReceiveFull,
  onReceivePartial,
  onSkip,
  onScan,
}: ReceiveLineCardProps) {
  return (
    <VyronCard className={`gap-4 ${line.skipped ? "opacity-60" : ""}`}>
      <View className="gap-1">
        <Text className="text-xl font-bold text-vyron-text">{line.ingredientName}</Text>
        <Text className="text-sm font-semibold text-vyron-muted">
          Ordered {line.orderedQty} {line.unit} · Received {line.receivedQty} · Outstanding {line.outstandingQty}
        </Text>
      </View>

      <View className="flex-row items-end gap-3">
        <View className="flex-1">
          <VyronInput
            label="Receive quantity"
            keyboardType="decimal-pad"
            value={line.receiveQty ? String(line.receiveQty) : ""}
            onChangeText={(text) => onChangeQty(Number(text.replace(/[^0-9.]/g, "")) || 0)}
            editable={!line.skipped}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          className="min-h-[56px] items-center justify-center rounded-vyron border border-vyron-border bg-vyron-surface px-4"
          onPress={onScan}
          disabled={!onScan}
        >
          <Text className="text-sm font-bold text-vyron-text">Scan</Text>
        </Pressable>
      </View>

      {error ? <Text className="text-sm font-semibold text-vyron-rose">{error}</Text> : null}

      <View className="flex-row flex-wrap gap-3">
        <VyronButton label="Receive Full" variant="secondary" className="flex-1 min-w-[140px]" onPress={onReceiveFull} />
        <VyronButton
          label="Receive Partial"
          variant="ghost"
          className="flex-1 min-w-[140px]"
          onPress={onReceivePartial}
        />
        <VyronButton label="Skip" variant="ghost" className="flex-1 min-w-[100px]" onPress={onSkip} />
      </View>
    </VyronCard>
  );
}
