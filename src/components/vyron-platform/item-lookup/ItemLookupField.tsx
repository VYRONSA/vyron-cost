"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import type {
  ItemLookupItemType,
  ItemLookupResult,
  ItemLookupSearchResponse,
} from "@/lib/platform/item-lookup/ItemLookupTypes";

const TYPE_FILTERS: { value: ItemLookupItemType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ingredients", label: "Ingredients" },
  { value: "packaging", label: "Packaging" },
  { value: "finished_goods", label: "Finished Goods" },
];

export type ItemLookupFieldProps = {
  onSelect: (item: ItemLookupResult) => void;
  placeholder?: string;
  initialValue?: string;
  defaultType?: ItemLookupItemType | "all";
  className?: string;
};

function highlightMatch(text: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const index = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-amber-200 px-0.5 text-slate-950">{text.slice(index, index + trimmed.length)}</mark>
      {text.slice(index + trimmed.length)}
    </>
  );
}

/**
 * Shared VYRON platform item lookup — the standard line-item selector for every
 * document that references a product/ingredient (Purchase Orders, Sales Orders,
 * Customer Invoices, Stock Movements, BOM/Recipes, and future modules).
 */
export function ItemLookupField({ onSelect, placeholder, initialValue, defaultType = "all", className }: ItemLookupFieldProps) {
  const [query, setQuery] = useState(initialValue || "");
  const [items, setItems] = useState<ItemLookupResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [typeFilter, setTypeFilter] = useState<ItemLookupItemType | "all">(defaultType);
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const runSearch = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (typeFilter !== "all") params.set("type", typeFilter);
      params.set("status", statusFilter);
      const response = await fetch(`/api/item-lookup/search?${params.toString()}`);
      const payload = (await response.json()) as ItemLookupSearchResponse;
      if (seq !== requestSeq.current) return;
      setItems(payload.ok ? payload.items : []);
      setActiveIndex(-1);
    } catch {
      if (seq === requestSeq.current) setItems([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [query, typeFilter, statusFilter]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch();
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, runSearch]);

  function choose(item: ItemLookupResult) {
    onSelect(item);
    setQuery(item.productName);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(items.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      if (activeIndex >= 0 && items[activeIndex]) {
        event.preventDefault();
        choose(items[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Search by code, barcode, name or supplier item code..."}
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-9 pr-9 text-sm font-bold text-slate-900 outline-none focus:border-slate-400"
        />
        {loading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" /> : null}
      </div>

      {open ? (
        <div className="absolute z-30 mt-2 w-full min-w-[420px] rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-3 py-2">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setTypeFilter(filter.value)}
                className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide transition ${
                  typeFilter === filter.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {filter.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStatusFilter((current) => (current === "active" ? "all" : "active"))}
              className={`ml-auto rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide transition ${
                statusFilter === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {statusFilter === "active" ? "Active Only" : "All Statuses"}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-4 text-sm font-semibold text-slate-500">
                {loading ? "Searching..." : "No items found."}
              </div>
            ) : (
              items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(item)}
                  className={`flex w-full items-center justify-between gap-3 border-b border-slate-50 px-4 py-3 text-left transition ${
                    activeIndex === index ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-black text-slate-950">{highlightMatch(item.productName, query)}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                        {item.entityType.replace("_", " ")}
                      </span>
                      {!item.isActive ? (
                        <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-600">
                          Inactive
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
                      {highlightMatch(item.itemCode, query)}
                      {item.category ? ` · ${item.category}` : ""}
                      {item.supplierName ? ` · ${item.supplierName}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-black text-slate-900">R{item.currentCost.toFixed(2)}</span>
                    <span className="block text-xs font-semibold text-slate-500">
                      {item.qtyOnHand.toFixed(2)} {item.unit}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
