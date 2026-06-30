import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { VyronButton, VyronEmptyState } from "@/components/ui";

export default function CountSuccessScreen() {
  const router = useRouter();
  const { item } = useLocalSearchParams<{ item?: string }>();

  return (
    <View className="flex-1 bg-vyron-bg px-5 py-10">
      <VyronEmptyState
        title="Stock count saved"
        description={
          item
            ? `${item} count posted to VYRON COST. Running balance and valuation updated on the server.`
            : "Stock count saved successfully."
        }
        actionLabel="Return to inventory"
        onAction={() => router.replace("/inventory")}
      />
      <View className="mt-4">
        <VyronButton label="Continue counting" variant="secondary" onPress={() => router.replace("/inventory/count")} />
      </View>
    </View>
  );
}
