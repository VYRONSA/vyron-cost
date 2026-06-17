import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

export function VyronSectionHeader({
  title,
  icon,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] ${M.muted} ${className}`.trim()}
    >
      {icon ?? <Sparkles size={14} className="text-[#7C3AED]" />}
      {title}
    </div>
  );
}
