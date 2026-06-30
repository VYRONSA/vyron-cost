import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { VyronEmptyState } from "@/components/ui";

export default function AdjustmentSuccessScreen() {
  const router = useRouter();
  const { item } = useLocalSearchParams<{ item?: string }>();

  return (
    <View className="flex-1 bg-vyron-bg px-5 py-10">
      <VyronEmptyState
        title="Adjustment posted"
        description={
          item
            ? `${item} adjustment recorded by VYRON COST. Inventory value and audit updated on the server.`
            : "Adjustment posted successfully."
        }
        actionLabel="Return to inventory"
        onAction={() => router.replace("/inventory")}
      />
    </View>
  );
}
