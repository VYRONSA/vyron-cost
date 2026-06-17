import type { ReactNode } from "react";
import { VYRON_MAX_WIDTH, VYRON_PAGE_PADDING } from "@/components/vyron-ui/constants";

/** Single alignment wrapper — hero, cards, forms and tables share one left edge. */
export function VyronPageContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto min-w-0 w-full max-w-full ${VYRON_MAX_WIDTH} ${VYRON_PAGE_PADDING} ${className}`.trim()}>
      {children}
    </div>
  );
}
