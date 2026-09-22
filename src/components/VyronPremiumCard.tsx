import { ReactNode } from "react";

export default function VyronPremiumCard({
  children,
  className = "",
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div className={`vyron-surface-card-elevated ${glow ? "ring-1 ring-[#1F4757]/25" : ""} ${className}`}>
      {children}
    </div>
  );
}
