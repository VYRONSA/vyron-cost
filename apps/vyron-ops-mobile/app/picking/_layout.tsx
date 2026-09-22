import { Stack } from "expo-router";
import { PickingDraftProvider } from "@/providers";

export default function PickingLayout() {
  return (
    <PickingDraftProvider>
      <Stack
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: "#0B202B" },
          headerTintColor: "#F8FAFC",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#061722" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Picking Queue" }} />
        <Stack.Screen name="[id]/index" options={{ title: "Store Order" }} />
        <Stack.Screen name="[id]/pick" options={{ title: "Pick Order" }} />
        <Stack.Screen name="[id]/summary" options={{ title: "Picking Summary" }} />
        <Stack.Screen name="success" options={{ title: "Picking Complete", headerShown: false }} />
      </Stack>
    </PickingDraftProvider>
  );
}
