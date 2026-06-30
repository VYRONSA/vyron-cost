import { Stack } from "expo-router";
import { ProductionDraftProvider } from "@/providers";

export default function ProductionLayout() {
  return (
    <ProductionDraftProvider>
      <Stack
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: "#0F1729" },
          headerTintColor: "#F8FAFC",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#070D18" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Production Queue" }} />
        <Stack.Screen name="[id]/index" options={{ title: "Production Run" }} />
        <Stack.Screen name="[id]/live" options={{ title: "Live Production" }} />
        <Stack.Screen name="[id]/summary" options={{ title: "Production Summary" }} />
        <Stack.Screen name="success" options={{ title: "Run Complete", headerShown: false }} />
      </Stack>
    </ProductionDraftProvider>
  );
}
