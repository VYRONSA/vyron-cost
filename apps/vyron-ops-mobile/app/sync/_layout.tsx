import { Stack } from "expo-router";

export default function SyncLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: "#0F1729" },
        headerTintColor: "#F8FAFC",
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: "#070D18" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Sync Dashboard" }} />
    </Stack>
  );
}
