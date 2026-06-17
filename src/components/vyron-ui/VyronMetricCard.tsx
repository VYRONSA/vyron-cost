import Link from "next/link";
import type { ReactNode } from "react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

export type VyronMetricTone = "default" | "healthy" | "warning" | "danger";

function valueClass(tone: VyronMetricTone, value: ReactNode) {
  if (tone === "warning") return M.metricValueWarning;
  if (tone === "danger") return M.metricValueDanger;
  if (tone === "healthy") return M.metricValueHealthy;
  if (typeof value === "string" && /^(live|monitoring|low risk|no risk)/i.test(value)) return M.metricValueMonitoring;
  return M.metricValueDefault;
}

const toneBorder: Record<VyronMetricTone, string> = {
  default: "border-[#E2E8F0]",
  healthy: "border-[#E2E8F0]",
  warning: "border-[#F43F5E]/25",
  danger: "border-[#F43F5E]/30",
};

export function VyronMetricCard({
  label,
  value,
  note,
  href,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  note?: string;
  href?: string;
  icon?: ReactNode;
  tone?: VyronMetricTone;
}) {
  const inner = (
    <>
      <div className="relative flex min-w-0 items-start justify-between gap-2">
        <div className={`min-w-0 break-words text-[11px] font-bold uppercase leading-4 tracking-[0.12em] ${M.muted}`}>
          {label}
        </div>
        {icon ? <div className="shrink-0 text-[#7C3AED] opacity-90">{icon}</div> : null}
      </div>
      <div
        className={`relative mt-auto min-w-0 break-words pt-3 text-base font-black leading-snug text-balance sm:text-lg xl:text-xl ${valueClass(tone, value)}`}
      >
        {value}
      </div>
      {note ? (
        <div className={`relative mt-2 min-w-0 break-words text-[11px] font-semibold uppercase tracking-[0.08em] ${M.muted}`}>
          {note}
        </div>
      ) : null}
    </>
  );

  const className = `group relative flex h-full min-h-[124px] min-w-0 flex-col overflow-hidden rounded-2xl border bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.05)] transition hover:border-[rgba(15,23,42,0.12)] hover:shadow-[0_8px_28px_rgba(15,23,42,0.08)] ${toneBorder[tone]}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}

export function VyronMetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{children}</div>;
}
