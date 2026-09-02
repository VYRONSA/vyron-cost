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
  { value: "ingredient", label: "Ingredients" },
  { value: "packaging", label: "Packaging" },
  { value: "finished_goods", label: "Finished Goods" },
];

export type ItemLookupFieldProps = {
  onSelect: (item: ItemLookupResult) => void;
  placeholder?: string;
  initialValue?: string;
  defaultType?: ItemLookupItemType | "all";
  className?: string;
  /**
   * Create a stock item for the selected master record. Only for flows that
   * cannot work without one, such as posting a stock movement; searching is
   * read-only everywhere else.
   */
  materialise?: boolean;
};

function highlightMatch(text: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const index = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-fuchsia-200 px-0.5 text-slate-950">{text.slice(index, index + trimmed.length)}</mark>
      {text.slice(index + trimmed.length)}
    </>
  );
}

/**
 * Shared VYRON platform item lookup — the standard line-item selector for every
 * document that references a product/ingredient (Purchase Orders, Sales Orders,
 * Customer Invoices, Stock Movements, BOM/Recipes, and future modules).
 */
/** One request covers a normal company's whole master list. */
const PAGE_SIZE = 200;

export function ItemLookupField({
  onSelect,
  placeholder,
  initialValue,
  defaultType = "all",
  className,
  materialise = false,
}: ItemLookupFieldProps) {
  const [query, setQuery] = useState(initialValue || "");
  const [items, setItems] = useState<ItemLookupResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [typeFilter, setTypeFilter] = useState<ItemLookupItemType | "all">(defaultType);
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Why the last search failed, if it did. Empty when all is well. */
  const [errorText, setErrorText] = useState("");
  /** How many matched in total, so a cut list can say so. */
  const [totalMatches, setTotalMatches] = useState(0);
  /*
   * Where the list can actually fit.
   *
   * The panel used to hang below the field at a fixed height. On a short
   * window, or with the field low on the page, the browser simply cut it off —
   * two rows of a 169-item list were visible and the picker read as broken.
   * It now opens into whichever side has more room and takes as much of it as
   * is available.
   */
  const [placement, setPlacement] = useState<{ above: boolean; maxHeight: number }>({
    above: false,
    maxHeight: 320,
  });
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
      // Enough to show a company's whole master list rather than the first 20.
      params.set("limit", String(PAGE_SIZE));
      if (materialise) params.set("materialise", "1");
      const response = await fetch(`/api/item-lookup/search?${params.toString()}`);
      const payload = (await response.json()) as ItemLookupSearchResponse;
      if (seq !== requestSeq.current) return;
      /*
       * A failed lookup is shown, not swallowed. Rendering an empty list for a
       * signed-out session or an unresolved workspace told the operator their
       * ingredients did not exist, which sent people looking for missing data
       * that was never missing.
       */
      if (!payload.ok) {
        setItems([]);
        setErrorText(payload.error || "Items could not be loaded.");
      } else {
        setItems(payload.items);
        setTotalMatches(Number(payload.total ?? payload.items.length));
        setErrorText("");
      }
      setActiveIndex(-1);
    } catch {
      if (seq === requestSeq.current) {
        setItems([]);
        setErrorText("Items could not be loaded. Check your connection and try again.");
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [query, typeFilter, statusFilter, materialise]);

  useEffect(() => {
    if (!open) return;

    const measure = () => {
      const anchor = containerRef.current;
      if (!anchor) return;
      const box = anchor.getBoundingClientRect();
      // Room between the field and each edge, less a small margin.
      const below = window.innerHeight - box.bottom - 16;
      const above = box.top - 16;
      const useAbove = above > below;
      const room = Math.floor(useAbove ? above : below);

      /*
       * The filter chips and the count line live above the list, inside the same
       * panel. Capping only the list left that chrome unaccounted for, so the
       * panel still overran the window by exactly its own header. It is measured
       * rather than assumed, because its height changes with the filter row
       * wrapping on narrow screens.
       */
      const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 0;
      const listHeight = listRef.current?.getBoundingClientRect().height ?? 0;
      const chrome = panelHeight > listHeight ? Math.ceil(panelHeight - listHeight) : 120;

      setPlacement({
        above: useAbove,
        // Strictly what fits. A minimum height here is what pushed the list off
        // the screen, which is precisely the fault being fixed.
        maxHeight: Math.max(96, Math.min(460, room - chrome)),
      });
    };

    /*
     * Bring the field to the middle of the window first. Opened where it sits,
     * a field near the bottom leaves room for two rows however carefully the
     * height is calculated; centring it gives the list half a screen to use.
     */
    containerRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
    const raf = requestAnimationFrame(measure);

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, items.length]);

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
        <div
          ref={panelRef}
          className={`absolute z-30 w-full min-w-[420px] rounded-2xl border border-slate-200 bg-white shadow-xl ${
            placement.above ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
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
                statusFilter === "active" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {statusFilter === "active" ? "Active Only" : "All Statuses"}
            </button>
          </div>

          {items.length ? (
            <p
              className={`border-b border-slate-100 px-4 py-2 text-xs font-bold ${
                totalMatches > items.length ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"
              }`}
            >
              {totalMatches > items.length
                ? `Showing ${items.length} of ${totalMatches} matches — type more to narrow the list.`
                : `${items.length} ${items.length === 1 ? "item" : "items"} — scroll, or type to narrow the list.`}
            </p>
          ) : null}

          {/* Sized to the room available, so the list is never a two-row sliver. */}
          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: placement.maxHeight }}>
            {items.length === 0 ? (
              errorText && !loading ? (
                <div className="px-4 py-4">
                  <p className="text-sm font-black text-rose-700">Items could not be loaded</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{errorText}</p>
                </div>
              ) : (
                <div className="px-4 py-4 text-sm font-semibold text-slate-500">
                  {loading ? "Searching..." : "No items found."}
                </div>
              )
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
