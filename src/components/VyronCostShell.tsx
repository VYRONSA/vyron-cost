"use client";

import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function VyronCostShell({
  children,
  title,
  subtitle,
  showBackButton: _showBackButton = true,
  commandCentre = false,
  hidePageHeader: hidePageHeaderProp,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  showBackButton?: boolean;
  commandCentre?: boolean;
  hidePageHeader?: boolean;
}) {
  const hidePageHeader = hidePageHeaderProp ?? commandCentre;
  return (
    <VyronCostAiShell title={title} subtitle={subtitle} hidePageHeader={hidePageHeader}>
      {children}
    </VyronCostAiShell>
  );
}
