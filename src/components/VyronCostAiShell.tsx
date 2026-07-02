import type { ReactNode } from "react";
import { enforceAuthenticatedDashboardDynamicRendering } from "@/lib/vyron-authenticated-dashboard-runtime";
import VyronCostAiShellClient from "@/components/VyronCostAiShellClient";

export default function VyronCostAiShell({
  title,
  subtitle,
  children,
  hidePageHeader = false,
  fullWidthMain = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  hidePageHeader?: boolean;
  fullWidthMain?: boolean;
}) {
  enforceAuthenticatedDashboardDynamicRendering();

  return (
    <VyronCostAiShellClient
      title={title}
      subtitle={subtitle}
      hidePageHeader={hidePageHeader}
      fullWidthMain={fullWidthMain}
    >
      {children}
    </VyronCostAiShellClient>
  );
}
