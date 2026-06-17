import type { ReactNode } from "react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

export function VyronSurfaceCard({
  children,
  className = "",
  title,
  subtitle,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className={`min-w-0 max-w-full p-6 ${M.lightCard} ${className}`.trim()}>
      {title ? <h3 className={`break-words text-lg font-bold ${M.heading}`}>{title}</h3> : null}
      {subtitle ? <p className={`mt-1 break-words text-sm ${M.body}`}>{subtitle}</p> : null}
      <div className={title || subtitle ? "mt-5" : undefined}>{children}</div>
    </div>
  );
}
