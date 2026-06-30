import { ActivityIndicator, View } from "react-native";
import { colors } from "@/theme";

export function VyronLoading({ size = "large" }: { size?: "small" | "large" }) {
  return (
    <View className="items-center justify-center py-10">
      <ActivityIndicator size={size} color={colors.emerald} />
    </View>
  );
}
