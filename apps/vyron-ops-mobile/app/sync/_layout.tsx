import { Stack } from "expo-router";

export default function SyncLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: "#0B202B" },
        headerTintColor: "#F8FAFC",
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: "#061722" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Sync Dashboard" }} />
    </Stack>
  );
}
