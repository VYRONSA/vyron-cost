import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { VyronButton, VyronEmptyState } from "@/components/ui";

export default function PickingSuccessScreen() {
  const router = useRouter();
  const { orderNumber } = useLocalSearchParams<{ orderNumber?: string }>();

  return (
    <View className="flex-1 bg-vyron-bg px-5 py-10">
      <VyronEmptyState
        title="Picking completed"
        description={
          orderNumber
            ? `Store order ${orderNumber} is ready for dispatch. Inventory and workflow updates are managed by VYRON COST.`
            : "Picking was completed successfully."
        }
        actionLabel="Return to home"
        onAction={() => router.replace("/")}
      />
      <View className="mt-4 gap-3">
        <VyronButton label="Dispatch queue" variant="secondary" onPress={() => router.replace("/dispatch")} />
        <VyronButton label="Picking queue" variant="ghost" onPress={() => router.replace("/picking")} />
      </View>
    </View>
  );
}
