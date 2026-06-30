import { createContext, ReactNode, useContext, useMemo, useState } from "react";

type SettingsState = {
  hapticsEnabled: boolean;
  biometricEnabled: boolean;
  compactMode: boolean;
};

type SettingsContextValue = SettingsState & {
  updateSettings: (patch: Partial<SettingsState>) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>({
    hapticsEnabled: true,
    biometricEnabled: false,
    compactMode: false,
  });

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...settings,
      updateSettings: (patch) => setSettings((current) => ({ ...current, ...patch })),
    }),
    [settings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within SettingsProvider");
  return context;
}
