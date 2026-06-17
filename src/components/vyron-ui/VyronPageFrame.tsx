import type { ReactNode } from "react";
import { VYRON_PAGE_GAP } from "@/components/vyron-ui/constants";

export function VyronPageFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`grid min-w-0 w-full max-w-full ${VYRON_PAGE_GAP} ${className}`.trim()}>{children}</div>;
}
