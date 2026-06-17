import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

function isMonitoringLabel(text: string) {
  return /^(live|monitoring|low risk|no risk|no risk detected|monitoring workspace|no spike detected)$/i.test(
    text.trim()
  );
}

export function VyronInsightCard({
  eyebrow,
  title,
  status,
  statusTone = "default",
  rows,
  icon,
  sideItems,
  footerLabel = "Open panel",
}: {
  eyebrow: string;
  title: string;
  status: string;
  statusTone?: "default" | "healthy" | "warning";
  rows: Array<[string, string]>;
  icon?: ReactNode;
  sideItems?: string[];
  footerLabel?: string;
}) {
  const statusClass =
    statusTone === "warning"
      ? "border border-[#F43F5E]/25 bg-[#F43F5E]/8 text-[#E11D48]"
      : statusTone === "healthy" || isMonitoringLabel(status)
        ? M.statusBrand
        : "border border-[#7C3AED]/20 bg-[#7C3AED]/8 text-[#7C3AED]";

  return (
    <section className={`relative min-h-[360px] min-w-0 max-w-full p-6 md:p-7 ${M.lightCard}`}>
      <div className="relative grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
        <div className="min-w-0">
          <div className={`text-[11px] font-bold uppercase tracking-[0.14em] ${M.muted}`}>{eyebrow}</div>
          <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass}`}>
            {status}
          </div>
          <div className="mt-4 flex items-start justify-between gap-4">
            <h3 className={`min-w-0 break-words text-2xl leading-tight text-balance md:text-[1.65rem] ${M.heading}`}>
              {title}
            </h3>
            {icon ? (
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center ${M.iconSubtle}`}>{icon}</div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className={`flex min-w-0 items-center justify-between gap-3 overflow-hidden px-4 py-3 text-sm ${M.dashboardWidgetNested}`}
              >
                <span className={`min-w-0 break-words font-semibold ${M.muted}`}>{label}</span>
                <span
                  className={`min-w-0 shrink-0 text-right break-words font-bold ${isMonitoringLabel(value) ? "text-[#7C3AED]" : "text-[#0F172A]"}`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div
            className={`mt-5 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.12em] ${statusTone === "warning" ? "text-[#E11D48]" : "text-[#7C3AED]"}`}
          >
            {footerLabel} <ArrowRight size={14} />
          </div>
        </div>

        {sideItems && sideItems.length > 0 ? (
          <div className={`relative min-h-[220px] min-w-0 max-w-full overflow-hidden rounded-xl border border-[#E2E8F0] p-4 ${M.pageMuted}`}>
            <div className="relative flex h-full flex-col justify-center gap-3">
              {sideItems.map((item, index) => (
                <div key={item} className={`rounded-xl border border-[#E2E8F0] bg-white px-4 py-3`}>
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        index === 0 ? "bg-[#F43F5E]" : index === 1 ? "bg-[#7C3AED]" : "bg-[#9333EA]"
                      }`}
                    />
                    <div className={`text-xs font-bold uppercase tracking-[0.1em] ${M.body}`}>{item}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
