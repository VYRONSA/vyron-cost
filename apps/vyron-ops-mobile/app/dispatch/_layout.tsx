import { Stack } from "expo-router";
import { DeliveryDraftProvider } from "@/providers";

export default function DispatchLayout() {
  return (
    <DeliveryDraftProvider>
      <Stack
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: "#0F1729" },
          headerTintColor: "#F8FAFC",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#070D18" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Dispatch Queue" }} />
        <Stack.Screen name="[id]/index" options={{ title: "Dispatch Order" }} />
        <Stack.Screen name="[id]/deliver" options={{ title: "Delivery Confirmation" }} />
        <Stack.Screen name="success" options={{ title: "Delivery Complete", headerShown: false }} />
      </Stack>
    </DeliveryDraftProvider>
  );
}
