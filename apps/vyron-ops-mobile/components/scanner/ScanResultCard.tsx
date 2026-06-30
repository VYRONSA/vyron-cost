import { Text, View } from "react-native";
import { VyronCard } from "@/components/ui";
import type { ScanValidationResult } from "@/types/scanner";

type ScanResultCardProps = {
  result: ScanValidationResult;
};

export function ScanResultCard({ result }: ScanResultCardProps) {
  const success = result.valid;
  return (
    <VyronCard className={`gap-3 border-2 ${success ? "border-vyron-emerald" : "border-vyron-rose"}`}>
      <Text className={`text-2xl font-bold ${success ? "text-vyron-emerald" : "text-vyron-rose"}`}>
        {success ? "Scan verified" : "Scan rejected"}
      </Text>
      {result.matched ? (
        <>
          <Text className="text-xl font-bold text-vyron-text">{result.matched.description}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">SKU {result.matched.itemCode}</Text>
          <Text className="text-lg font-semibold text-vyron-emerald">
            {result.matched.qtyOnHand} {result.matched.unit} on hand
          </Text>
        </>
      ) : null}
      {!success ? (
        <View className="gap-2">
          {result.expected ? (
            <Text className="text-base font-medium text-vyron-muted">Expected: {result.expected.label}</Text>
          ) : null}
          {result.actual ? (
            <Text className="text-base font-medium text-vyron-rose">Actual: {result.actual.label}</Text>
          ) : null}
          <Text className="text-base font-semibold text-vyron-amber">{result.recommendation}</Text>
        </View>
      ) : null}
      <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">{result.action}</Text>
    </VyronCard>
  );
}
