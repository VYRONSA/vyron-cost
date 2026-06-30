import { ReactNode } from "react";
import { useAuth, useTenant } from "@/providers";
import { SyncProvider } from "./SyncProvider";

export function SyncBridge({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { tenant } = useTenant();
  return (
    <SyncProvider
      actorEmail={session?.email}
      companyId={tenant.companyId}
      workspaceId={tenant.workspaceId}
    >
      {children}
    </SyncProvider>
  );
}
