import { createContext, ReactNode, useContext } from "react";
import { colors } from "@/theme";

type ThemeContextValue = {
  colors: typeof colors;
  isDark: true;
};

const ThemeContext = createContext<ThemeContextValue>({
  colors,
  isDark: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={{ colors, isDark: true }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
