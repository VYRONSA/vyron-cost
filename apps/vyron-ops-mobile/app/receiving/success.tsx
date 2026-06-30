import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { VyronButton, VyronEmptyState } from "@/components/ui";

export default function ReceiptSuccessScreen() {
  const router = useRouter();
  const { poNumber } = useLocalSearchParams<{ poNumber?: string }>();

  return (
    <View className="flex-1 bg-vyron-bg px-5 py-10">
      <VyronEmptyState
        title="Receipt confirmed"
        description={
          poNumber
            ? `Purchase Order ${poNumber} has been received. Inventory and audit records were updated by VYRON COST.`
            : "The purchase order was received successfully."
        }
        actionLabel="Return to home"
        onAction={() => router.replace("/")}
      />
      <View className="mt-4">
        <VyronButton label="Back to receiving queue" variant="secondary" onPress={() => router.replace("/receiving")} />
      </View>
    </View>
  );
}
