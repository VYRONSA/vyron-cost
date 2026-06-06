"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export default function PaginatedTableControls({
  page,
  pageCount,
  setPage,
  total,
}: {
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  total: number;
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 rounded-[1.4rem] border border-slate-100 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
        {total} records · Page {page + 1} of {Math.max(pageCount, 1)}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => setPage(Math.max(page - 1, 0))}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm disabled:opacity-40"
        >
          <ChevronLeft size={15} />
          Prev
        </button>

        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => setPage(Math.min(page + 1, pageCount - 1))}
          className="inline-flex items-center gap-2 rounded-full bg-[#07110d] px-4 py-2 text-xs font-black text-emerald-300 disabled:opacity-40"
        >
          Next
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
