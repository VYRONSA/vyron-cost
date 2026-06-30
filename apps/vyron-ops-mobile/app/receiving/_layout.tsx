import { Stack } from "expo-router";
import { ReceivingDraftProvider } from "@/providers";

export default function ReceivingLayout() {
  return (
    <ReceivingDraftProvider>
      <Stack
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: "#0F1729" },
          headerTintColor: "#F8FAFC",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#070D18" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Receiving Queue" }} />
        <Stack.Screen name="[id]/index" options={{ title: "Purchase Order" }} />
        <Stack.Screen name="[id]/receive" options={{ title: "Receive Stock" }} />
        <Stack.Screen name="[id]/confirm" options={{ title: "Confirm Receipt" }} />
        <Stack.Screen name="success" options={{ title: "Receipt Complete", headerShown: false }} />
      </Stack>
    </ReceivingDraftProvider>
  );
}
