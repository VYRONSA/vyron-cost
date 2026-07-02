import { Stack } from "expo-router";

export default function InventoryLayout() {
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
      <Stack.Screen name="index" options={{ title: "Inventory Operations" }} />
      <Stack.Screen name="lookup" options={{ title: "Stock Lookup" }} />
      <Stack.Screen name="lookup/[id]" options={{ title: "Stock Detail" }} />
      <Stack.Screen name="count/index" options={{ title: "Stock Count" }} />
      <Stack.Screen name="count/[id]" options={{ title: "Count Item" }} />
      <Stack.Screen name="count/review/[id]" options={{ title: "Count Approval" }} />
      <Stack.Screen name="count/success" options={{ title: "Count Saved", headerShown: false }} />
      <Stack.Screen name="adjustment/index" options={{ title: "Adjustment" }} />
      <Stack.Screen name="adjustment/summary" options={{ title: "Confirm Adjustment" }} />
      <Stack.Screen name="adjustment/success" options={{ title: "Adjustment Posted", headerShown: false }} />
      <Stack.Screen name="transfer/index" options={{ title: "Stock Transfer" }} />
      <Stack.Screen name="transfer/success" options={{ title: "Transfer Complete", headerShown: false }} />
      <Stack.Screen name="history" options={{ title: "Inventory History" }} />
    </Stack>
  );
}
