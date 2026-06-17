"use client";

import { Search, X } from "lucide-react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

export default function SearchFilterBar({
  value,
  onChange,
  placeholder,
  resultCount,
  variant = "light",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  resultCount?: number;
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";

  return (
    <div className={isDark ? M.filterBarOnDark : M.filterBar}>
      <div className="flex items-center gap-3">
        <div
          className={
            isDark
              ? "flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-[#CBD5E1]"
              : `flex h-11 w-11 items-center justify-center ${M.iconSubtle}`
          }
        >
          <Search size={20} />
        </div>

        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={
            isDark
              ? `w-full bg-transparent text-sm font-semibold text-[#F8FAFC] outline-none placeholder:text-[#94A3B8] ${M.inputPlaceholder}`
              : `w-full bg-transparent text-sm font-semibold text-[#0F172A] outline-none ${M.inputPlaceholder}`
          }
        />

        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className={
              isDark
                ? "flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[#CBD5E1] hover:bg-white/15"
                : "flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#F6F7FB] text-[#64748B] hover:bg-[#EEF2F7]"
            }
          >
            <X size={16} />
          </button>
        )}

        {typeof resultCount === "number" && (
          <div
            className={
              isDark
                ? "hidden rounded-full border border-[#7C3AED]/30 bg-[#7C3AED]/15 px-4 py-2 text-xs font-bold text-[#CBD5E1] md:block"
                : `hidden rounded-full border border-[#7C3AED]/25 bg-[#7C3AED]/8 px-4 py-2 text-xs font-bold text-[#7C3AED] md:block`
            }
          >
            {resultCount} results
          </div>
        )}
      </div>
    </div>
  );
}
