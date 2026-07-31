import { ReactNode } from "react";

export default function VyronSurfaceCard({
  children,
  className = "",
  elevated = false,
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`${elevated ? "vyron-surface-card-elevated" : "vyron-surface-card"} ${
        accent ? "ring-1 ring-[#1D6BFF]/25" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function formatCompactAnnual(value: number) {
  const v = Number(value || 0);
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `R${m.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}M`;
  }
  if (v >= 1_000) return `R${Math.round(v / 1000)}k`;
  return `R${Math.round(v).toLocaleString("en-ZA")}`;
}

export function formatExecutiveMoney(value: number) {
  return `R${Math.round(value || 0)
    .toLocaleString("en-ZA")
    .replace(/,/g, " ")}`;
}
