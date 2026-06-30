import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { configureApiClient } from "@/services/api";
import { getCurrentSession, signOut as authSignOut } from "@/services/auth";
import type { AuthSession } from "@/types";

type AuthContextValue = {
  session: AuthSession | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = async () => {
    const next = await getCurrentSession();
    setSession(next);
  };

  useEffect(() => {
    configureApiClient({
      getAccessToken: async () => session?.accessToken ?? null,
      onUnauthorized: async () => {
        await authSignOut();
        setSession(null);
      },
    });
  }, [session]);

  useEffect(() => {
    refreshSession().finally(() => setIsLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      signOut: async () => {
        await authSignOut();
        setSession(null);
      },
      refreshSession,
    }),
    [session, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
