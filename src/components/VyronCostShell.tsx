"use client";

import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function VyronCostShell({
  children,
  title,
  subtitle,
  showBackButton: _showBackButton = true,
  commandCentre = false,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  showBackButton?: boolean;
  commandCentre?: boolean;
}) {
  return (
    <VyronCostAiShell title={title} subtitle={subtitle} hidePageHeader={commandCentre}>
      {children}
    </VyronCostAiShell>
  );
}
