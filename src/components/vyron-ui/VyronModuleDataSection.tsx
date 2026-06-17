import type { ReactNode } from "react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

/** White data section for module tables/forms — fixes dark-on-dark readability */
export function VyronModuleDataSection({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`${M.moduleDataSection} ${className}`.trim()}>{children}</section>;
}

export function VyronTableSurface({
  children,
  onDark = false,
  className = "",
}: {
  children: ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  return <div className={`${onDark ? M.tableSurfaceOnDark : M.tableSurface} ${className}`.trim()}>{children}</div>;
}
