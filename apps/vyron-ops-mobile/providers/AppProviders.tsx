import { ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./AuthProvider";
import { QueryProvider } from "./QueryProvider";
import { SettingsProvider } from "./SettingsProvider";
import { SyncBridge } from "./SyncBridge";
import { TenantProvider } from "./TenantProvider";
import { ThemeProvider } from "./ThemeProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <TenantProvider>
                <SyncBridge>
                  <SettingsProvider>{children}</SettingsProvider>
                </SyncBridge>
              </TenantProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
