import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { VyronButton, VyronEmptyState } from "@/components/ui";

export default function ProductionSuccessScreen() {
  const router = useRouter();
  const { runNumber } = useLocalSearchParams<{ runNumber?: string }>();

  return (
    <View className="flex-1 bg-vyron-bg px-5 py-10">
      <VyronEmptyState
        title="Production run completed"
        description={
          runNumber
            ? `Production Run ${runNumber} has been completed. Inventory, costing and audit records were updated by VYRON COST.`
            : "The production run was completed successfully."
        }
        actionLabel="Return to home"
        onAction={() => router.replace("/")}
      />
      <View className="mt-4">
        <VyronButton label="Back to production queue" variant="secondary" onPress={() => router.replace("/production")} />
      </View>
    </View>
  );
}
