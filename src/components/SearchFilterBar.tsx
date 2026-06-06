"use client";

import { Search, X } from "lucide-react";

export default function SearchFilterBar({
  value,
  onChange,
  placeholder,
  resultCount,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  resultCount?: number;
}) {
  return (
    <div className="mb-5 rounded-[1.5rem] border border-emerald-100 bg-white p-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Search size={20} />
        </div>

        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm font-black text-slate-700 outline-none placeholder:text-slate-400"
        />

        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            <X size={16} />
          </button>
        )}

        {typeof resultCount === "number" && (
          <div className="hidden rounded-full bg-[#07110d] px-4 py-2 text-xs font-black text-emerald-300 md:block">
            {resultCount} results
          </div>
        )}
      </div>
    </div>
  );
}
