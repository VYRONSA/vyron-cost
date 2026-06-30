import { createContext, ReactNode, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { resolveTenant } from "@/platform/tenant";
import type { TenantContext } from "@/types";

type TenantContextValue = {
  tenant: TenantContext;
  isLoading: boolean;
  refetch: () => void;
};

const TenantCtx = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["tenant"],
    queryFn: resolveTenant,
  });

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant: query.data ?? {
        workspaceId: null,
        companyId: null,
        companyName: "VYRON OPS",
        tradingName: "VYRON OPS",
        packageName: "Professional",
      },
      isLoading: query.isLoading,
      refetch: () => {
        void query.refetch();
      },
    }),
    [query.data, query.isLoading, query.refetch]
  );

  return <TenantCtx.Provider value={value}>{children}</TenantCtx.Provider>;
}

export function useTenant() {
  const context = useContext(TenantCtx);
  if (!context) throw new Error("useTenant must be used within TenantProvider");
  return context;
}
