import { BarChart3, Target, TrendingUp, Wallet } from "lucide-react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

export function VyronFooterStrip() {
  const items = [
    { label: "Reduce Cost Leakage", icon: Wallet, color: "text-[#E11D48]" },
    { label: "Improve Accuracy", icon: Target, color: "text-[#7C3AED]" },
    { label: "Increase Margins", icon: TrendingUp, color: "text-[#9333EA]" },
    { label: "Drive Performance", icon: BarChart3, color: "text-[#F43F5E]" },
  ];

  return (
    <div className={`relative overflow-hidden px-5 py-4 md:px-6 ${M.lightCard}`}>
      <p className={`relative text-center text-[11px] font-bold uppercase tracking-[0.16em] ${M.muted}`}>
        Cost Intelligence · Operational Discipline · Profit Protection
      </p>
      <div className="relative mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {items.map(({ label, icon: Icon, color }) => (
          <div
            key={label}
            className={`flex items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F6F7FB] px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide ${M.body}`}
          >
            <Icon size={14} className={color} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
