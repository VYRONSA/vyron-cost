import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View className="flex-1 items-center justify-center gap-4 bg-vyron-bg p-6">
        <Text className="text-2xl font-bold text-vyron-text">Screen not found</Text>
        <Link href="/">
          <Text className="text-base font-semibold text-vyron-emerald">Return to Home</Text>
        </Link>
      </View>
    </>
  );
}
