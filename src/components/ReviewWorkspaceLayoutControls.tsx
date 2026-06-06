"use client";

import { Columns2, FileText, PanelRight } from "lucide-react";

export type ReviewWorkspaceLayout = "split" | "focus-invoice" | "focus-review";

const MODES: Array<{ id: ReviewWorkspaceLayout; label: string; icon: typeof Columns2 }> = [
  { id: "focus-invoice", label: "Focus Invoice", icon: FileText },
  { id: "split", label: "Split View", icon: Columns2 },
  { id: "focus-review", label: "Focus Review", icon: PanelRight },
];

export default function ReviewWorkspaceLayoutControls({
  layout,
  onChange,
}: {
  layout: ReviewWorkspaceLayout;
  onChange: (layout: ReviewWorkspaceLayout) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
      {MODES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black transition ${
            layout === id ? "bg-white text-violet-800 shadow-sm" : "text-slate-600 hover:bg-white/70"
          }`}
        >
          <Icon size={12} />
          {label}
        </button>
      ))}
    </div>
  );
}

export function layoutColumnClass(layout: ReviewWorkspaceLayout, side: "invoice" | "review") {
  if (layout === "focus-invoice") {
    return side === "invoice" ? "w-[72%]" : "w-[28%] min-w-[280px]";
  }
  if (layout === "focus-review") {
    return side === "invoice" ? "w-[28%] min-w-[240px]" : "w-[72%]";
  }
  return side === "invoice" ? "w-1/2" : "w-1/2";
}
