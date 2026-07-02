import "../global.css";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-gesture-handler";
import "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { AppProviders } from "@/providers";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <AppProviders>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#070D18" } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="receiving" />
        <Stack.Screen name="production" />
        <Stack.Screen name="picking" />
        <Stack.Screen name="dispatch" />
        <Stack.Screen name="inventory" />
        <Stack.Screen name="sales" />
        <Stack.Screen name="sync" />
      </Stack>
    </AppProviders>
  );
}
