import { Stack } from "expo-router";

export default function SalesLayout() {
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
      <Stack.Screen name="index" options={{ title: "Sales & Invoices" }} />
      <Stack.Screen name="new" options={{ title: "New Invoice" }} />
      <Stack.Screen name="[id]/index" options={{ title: "Invoice Detail" }} />
      <Stack.Screen name="customer/[id]" options={{ title: "Customer Profile" }} />
      <Stack.Screen name="product/[id]" options={{ title: "Product Detail" }} />
      <Stack.Screen name="product-intelligence" options={{ title: "Product Intelligence" }} />
    </Stack>
  );
}
