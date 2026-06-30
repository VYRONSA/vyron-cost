import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { VyronButton, VyronEmptyState } from "@/components/ui";

export default function DispatchSuccessScreen() {
  const router = useRouter();
  const { orderNumber } = useLocalSearchParams<{ orderNumber?: string }>();

  return (
    <View className="flex-1 bg-vyron-bg px-5 py-10">
      <VyronEmptyState
        title="Delivery confirmed"
        description={
          orderNumber
            ? `Store order ${orderNumber} delivery has been recorded by VYRON COST.`
            : "Delivery was confirmed successfully."
        }
        actionLabel="Return to home"
        onAction={() => router.replace("/")}
      />
      <View className="mt-4">
        <VyronButton label="Back to dispatch queue" variant="secondary" onPress={() => router.replace("/dispatch")} />
      </View>
    </View>
  );
}
