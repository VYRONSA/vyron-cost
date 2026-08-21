import type { ReactNode } from "react";
import { enforceAuthenticatedDashboardDynamicRendering } from "@/lib/vyron-authenticated-dashboard-runtime";
import VyronCostAiShellClient from "@/components/VyronCostAiShellClient";

export default function VyronCostAiShell({
  title,
  subtitle,
  children,
  hidePageHeader = false,
  fullWidthMain = false,
  fullHeightWorkspace = false,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  hidePageHeader?: boolean;
  fullWidthMain?: boolean;
  fullHeightWorkspace?: boolean;
  /** Widen the content clamp for column-heavy pages such as invoice registers. */
  wide?: boolean;
}) {
  enforceAuthenticatedDashboardDynamicRendering();

  return (
    <VyronCostAiShellClient
      title={title}
      subtitle={subtitle}
      hidePageHeader={hidePageHeader}
      fullWidthMain={fullWidthMain}
      fullHeightWorkspace={fullHeightWorkspace}
      wide={wide}
    >
      {children}
    </VyronCostAiShellClient>
  );
}
