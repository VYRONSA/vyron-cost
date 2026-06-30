import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { VyronButton, VyronEmptyState } from "@/components/ui";

export default function TransferSuccessScreen() {
  const router = useRouter();
  const { item } = useLocalSearchParams<{ item?: string }>();

  return (
    <View className="flex-1 bg-vyron-bg px-5 py-10">
      <VyronEmptyState
        title="Transfer completed"
        description={
          item
            ? `${item} transfer posted by VYRON COST. Balances updated on the server.`
            : "Transfer completed successfully."
        }
        actionLabel="Return to inventory"
        onAction={() => router.replace("/inventory")}
      />
      <View className="mt-4">
        <VyronButton label="Inventory history" variant="secondary" onPress={() => router.replace("/inventory/history")} />
      </View>
    </View>
  );
}
